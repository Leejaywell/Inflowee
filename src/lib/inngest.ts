import { Inngest } from "inngest";

import { deliverStoredBriefToConfiguredChannels } from "@/lib/delivery";
import {
  defaultStore,
  getDefaultRuntimeStore,
  hasProcessedDeliveryRequest,
  markDeliveryRequestProcessed,
} from "@/lib/store";
import { syncDueSources } from "@/lib/sync-runs";

export const SCHEDULED_SYNC_EVENT = "app/sources.sync.requested";
export const BRIEF_DELIVERY_EVENT = "app/briefs.delivery.requested";

type ScheduledSyncEventData = {
  now?: string;
};

type BriefDeliveryEventData = {
  briefId: string;
  requestKey?: string;
};

const briefDeliveryRequestRuns = new Map<
  string,
  ReturnType<typeof runBriefDeliveryEvent>
>();

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

function buildBriefDeliveryEventId(briefId: string, requestKey?: string) {
  if (!requestKey) {
    return undefined;
  }

  return `brief-delivery:${briefId}:${requestKey}`;
}

export async function queueBriefDelivery(
  briefId: string,
  options?: {
    requestKey?: string;
  },
): Promise<{ ids: string[] }> {
  const requestKey = options?.requestKey;

  return inngest.send({
    id: buildBriefDeliveryEventId(briefId, requestKey),
    name: BRIEF_DELIVERY_EVENT,
    data: requestKey ? { briefId, requestKey } : { briefId },
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

  return deliverStoredBriefToConfiguredChannels(runtimeStore, data.briefId, {
    maxAttempts: 2,
  });
}

export async function handleBriefDeliveryRequested(data: BriefDeliveryEventData) {
  const requestRunId = buildBriefDeliveryEventId(data.briefId, data.requestKey);
  const runtimeStore = process.env.DATABASE_URL
    ? getDefaultRuntimeStore()
    : defaultStore;

  if (!requestRunId) {
    return runBriefDeliveryEvent(data);
  }

  if (await hasProcessedDeliveryRequest(runtimeStore, requestRunId)) {
    return {
      status: "success",
      deduplicated: true,
      deliveries: [],
    } as const;
  }

  const existingRun = briefDeliveryRequestRuns.get(requestRunId);

  if (existingRun) {
    return existingRun;
  }

  const runPromise = runBriefDeliveryEvent(data)
    .then(async (result) => {
      if (result.status === "success") {
        await markDeliveryRequestProcessed(runtimeStore, requestRunId);
      }

      return result;
    })
    .finally(() => {
      briefDeliveryRequestRuns.delete(requestRunId);
    });
  briefDeliveryRequestRuns.set(requestRunId, runPromise);

  return runPromise;
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
      handleBriefDeliveryRequested(event.data as BriefDeliveryEventData),
    ),
);
