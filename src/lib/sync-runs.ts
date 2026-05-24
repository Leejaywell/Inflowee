import { syncSourceById, type SyncSourceResult } from "@/lib/source-ingestion";
import { shouldCollectForSchedule } from "@/lib/task-schedule";
import {
  getTaskById,
  listDueSources,
  listSources,
  scheduleNextSourceSync,
  type Store,
} from "@/lib/store";

export type SyncDueSourcesResult = {
  synced: number;
  failed: number;
  skipped: number;
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
  },
): Promise<SyncDueSourcesResult> {
  const now = options?.now ?? new Date().toISOString();
  const dueSources = await listDueSources(store, now);
  const syncImpl = options?.syncSourceByIdImpl ?? syncSourceById;
  const scheduledAt = new Date(now);
  const results: SyncSourceResult[] = [];
  let synced = 0;
  let failed = 0;
  let skippedBySchedule = 0;

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

  return {
    synced,
    failed,
    skipped:
      skippedBySchedule +
      Math.max(0, (await listSources(store)).length - dueSources.length),
    results,
  };
}
