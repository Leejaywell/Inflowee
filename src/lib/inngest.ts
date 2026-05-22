import { Inngest } from "inngest";

import { createStore, defaultStore } from "@/lib/store";
import { syncDueSources } from "@/lib/sync-runs";

export const SCHEDULED_SYNC_EVENT = "app/sources.sync.requested";

type ScheduledSyncEventData = {
  now?: string;
};

export const inngest = new Inngest({
  id: "inflowee",
  eventKey: process.env.INNGEST_EVENT_KEY,
  baseUrl: process.env.INNGEST_BASE_URL,
});

export async function enqueueScheduledSync(
  data: ScheduledSyncEventData = {},
): Promise<{ ids: string[] }> {
  return inngest.send({
    name: SCHEDULED_SYNC_EVENT,
    data,
  });
}

export async function runScheduledSyncEvent(
  data: ScheduledSyncEventData = {},
) {
  const runtimeStore = process.env.DATABASE_URL
    ? createStore({ databaseUrl: process.env.DATABASE_URL })
    : defaultStore;

  return syncDueSources(runtimeStore, {
    now: data.now ?? new Date().toISOString(),
  });
}

export const scheduledSyncFunction = inngest.createFunction(
  {
    id: "scheduled-source-sync",
    name: "Scheduled source sync",
  },
  {
    event: SCHEDULED_SYNC_EVENT,
  },
  async ({ event, step }) =>
    step.run("sync-due-sources", () => runScheduledSyncEvent(event.data ?? {})),
);
