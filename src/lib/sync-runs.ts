import {
  deliverTextToChannel,
  listDeliveryChannelsForTask,
  type DeliveryChannel,
} from "@/lib/delivery";
import { generateTaskReport } from "@/lib/reports";
import { syncSourceById, type SyncSourceResult } from "@/lib/source-ingestion";
import {
  getActiveScheduleWindow,
  shouldCollectForSchedule,
} from "@/lib/task-schedule";
import {
  getTaskById,
  listReportsByTask,
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
    generateTaskReportImpl?: typeof generateTaskReport;
    deliverTextToChannelImpl?: typeof deliverTextToChannel;
  },
): Promise<SyncDueSourcesResult> {
  const now = options?.now ?? new Date().toISOString();
  const dueSources = await listDueSources(store, now);
  const syncImpl = options?.syncSourceByIdImpl ?? syncSourceById;
  const generateReportImpl = options?.generateTaskReportImpl ?? generateTaskReport;
  const deliverReportImpl =
    options?.deliverTextToChannelImpl ?? deliverTextToChannel;
  const scheduledAt = new Date(now);
  const results: SyncSourceResult[] = [];
  const syncedTaskIds = new Set<string>();
  let synced = 0;
  let failed = 0;
  let skippedBySchedule = 0;
  let reportsGenerated = 0;
  let reportsDelivered = 0;

  for (const source of dueSources) {
    const task = await getTaskById(store, source.taskId);

    if (!shouldCollectForSchedule(task?.scheduleProfile, scheduledAt)) {
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
      syncedTaskIds.add(source.taskId);
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

  for (const taskId of syncedTaskIds) {
    const task = await getTaskById(store, taskId);
    const activeWindow = getActiveScheduleWindow(task?.scheduleProfile, scheduledAt);

    if (!task || !activeWindow?.generateReports) {
      continue;
    }

    const recentReports = await listReportsByTask(store, taskId);
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

    const reportId = await generateReportImpl(store, taskId, {
      mode: activeWindow.reportMode,
      now: scheduledAt,
    });
    reportsGenerated++;

    if (!activeWindow.push) {
      continue;
    }

    const report = (await listReportsByTask(store, taskId)).find(
      (candidate) => candidate.id === reportId,
    );

    if (!report) {
      continue;
    }

    const channels = await listDeliveryChannelsForTask(store, taskId);

    for (const channel of channels.slice(0, activeWindow.maxPushItems)) {
      const result = await deliverReportImpl(
        store,
        channel.type as DeliveryChannel,
        {
          id: report.id,
          title: report.title,
          body: report.markdown,
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
