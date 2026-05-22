import { Inngest } from "inngest";

import { deliverStoredBrief } from "@/lib/delivery";
import { defaultStore, getDefaultRuntimeStore } from "@/lib/store";
import { syncDueSources } from "@/lib/sync-runs";

export const SCHEDULED_SYNC_EVENT = "app/sources.sync.requested";
export const BRIEF_DELIVERY_EVENT = "app/briefs.delivery.requested";

type ScheduledSyncEventData = {
  now?: string;
};

type BriefDeliveryEventData = {
  briefId: string;
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

export async function queueBriefDelivery(briefId: string): Promise<{ ids: string[] }> {
  return inngest.send({
    name: BRIEF_DELIVERY_EVENT,
    data: { briefId },
  });
}

export async function runScheduledSyncEvent(
  data: ScheduledSyncEventData = {},
) {
  const runtimeStore = process.env.DATABASE_URL
    ? getDefaultRuntimeStore()
    : defaultStore;

  return syncDueSources(runtimeStore, {
    now: data.now ?? new Date().toISOString(),
  });
}

export async function runBriefDeliveryEvent(data: BriefDeliveryEventData) {
  const runtimeStore = process.env.DATABASE_URL
    ? getDefaultRuntimeStore()
    : defaultStore;

  return deliverStoredBrief(runtimeStore, data.briefId, {
    maxAttempts: 2,
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

export const briefDeliveryFunction = inngest.createFunction(
  {
    id: "brief-webhook-delivery",
    name: "Brief webhook delivery",
  },
  {
    event: BRIEF_DELIVERY_EVENT,
  },
  async ({ event, step }) =>
    step.run("deliver-brief", () =>
      runBriefDeliveryEvent(event.data as BriefDeliveryEventData),
    ),
);
