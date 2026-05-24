import {
  deliverTextToChannel,
  listDeliveryChannelsForTopic,
  type DeliveryChannel,
} from "@/lib/delivery";
import { generateTopicReport } from "@/lib/reports";
import { syncSourceById, type SyncSourceResult } from "@/lib/source-ingestion";
import {
  getActiveScheduleWindow,
  shouldCollectForSchedule,
} from "@/lib/topic-schedule";
import {
  getTopicById,
  listReportsByTopic,
  listDueSources,
  listSources,
  scheduleNextSourceSync,
  type Store,
} from "@/lib/store";

export type SyncDueSourcesResult = {
  synced: number;
  failed: number;
  skipped: number;
  reportsGenerated: number;
  reportsDelivered: number;
  results: SyncSourceResult[];
};

function getSyncErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown sync error.";
}

export async function syncDueSources(
  store: Store,
  options?: {
    now?: string;
    syncSourceByIdImpl?: typeof syncSourceById;
    generateTopicReportImpl?: typeof generateTopicReport;
    deliverTextToChannelImpl?: typeof deliverTextToChannel;
  },
): Promise<SyncDueSourcesResult> {
  const now = options?.now ?? new Date().toISOString();
  const dueSources = await listDueSources(store, now);
  const syncImpl = options?.syncSourceByIdImpl ?? syncSourceById;
  const generateReportImpl = options?.generateTopicReportImpl ?? generateTopicReport;
  const deliverReportImpl =
    options?.deliverTextToChannelImpl ?? deliverTextToChannel;
  const scheduledAt = new Date(now);
  const results: SyncSourceResult[] = [];
  const syncedTopicIds = new Set<string>();
  let synced = 0;
  let failed = 0;
  let skippedBySchedule = 0;
  let reportsGenerated = 0;
  let reportsDelivered = 0;

  for (const source of dueSources) {
    const topic = await getTopicById(store, source.topicId);

    if (!shouldCollectForSchedule(topic?.scheduleProfile, scheduledAt)) {
      skippedBySchedule++;
      continue;
    }

    let result: SyncSourceResult;

    try {
      result = await syncImpl(store, source.id);
    } catch (error) {
      result = {
        ok: false,
        error: getSyncErrorMessage(error),
        source,
      };
    }

    results.push(result);

    if (result.ok) {
      synced++;
      syncedTopicIds.add(source.topicId);
      await scheduleNextSourceSync(
        store,
        source.id,
        source.syncIntervalMinutes,
        now,
      );
    } else {
      failed++;
    }
  }

  for (const topicId of syncedTopicIds) {
    const topic = await getTopicById(store, topicId);
    const activeWindow = getActiveScheduleWindow(topic?.scheduleProfile, scheduledAt);

    if (!topic || !activeWindow?.generateReports) {
      continue;
    }

    const recentReports = await listReportsByTopic(store, topicId);
    const reportRecentlyGenerated = recentReports.some((report) => {
      if (report.mode !== activeWindow.reportMode) {
        return false;
      }

      const createdAt = new Date(report.createdAt).getTime();
      return scheduledAt.getTime() - createdAt < 60 * 60 * 1000;
    });

    if (reportRecentlyGenerated) {
      continue;
    }

    const reportId = await generateReportImpl(store, topicId, {
      mode: activeWindow.reportMode,
      now: scheduledAt,
    });
    reportsGenerated++;

    if (!activeWindow.push) {
      continue;
    }

    const report = (await listReportsByTopic(store, topicId)).find(
      (candidate) => candidate.id === reportId,
    );

    if (!report) {
      continue;
    }

    const channels = await listDeliveryChannelsForTopic(store, topicId);

    for (const channel of channels.slice(0, activeWindow.maxPushItems)) {
      const result = await deliverReportImpl(
        store,
        channel.type as DeliveryChannel,
        {
          id: report.id,
          title: report.title,
          body: report.markdown,
          contentType: "report",
        },
        { maxAttempts: 1 },
      );

      if (result.status === "success") {
        reportsDelivered++;
      }
    }
  }

  return {
    synced,
    failed,
    skipped:
      skippedBySchedule +
      Math.max(0, (await listSources(store)).length - dueSources.length),
    reportsGenerated,
    reportsDelivered,
    results,
  };
}
