import { syncSourceById, type SyncSourceResult } from "@/lib/source-ingestion";
import {
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
  const results: SyncSourceResult[] = [];
  let synced = 0;
  let failed = 0;

  for (const source of dueSources) {
    const result = await syncImpl(store, source.id);
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
    skipped: Math.max(0, (await listSources(store)).length - dueSources.length),
    results,
  };
}
