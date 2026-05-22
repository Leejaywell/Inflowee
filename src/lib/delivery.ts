import { renderBriefHtmlDigest } from "@/lib/brief-render";
import {
  createDeliveryLog,
  finishDeliveryLog,
  getBriefById,
  getWebhookSettings,
  listItemsByBriefId,
  type Store,
} from "@/lib/store";

export type DeliveryPayload = {
  briefId: string;
  format: "html";
  title: string;
  html: string;
};

export type DeliveryChannel = "webhook" | "slack";
export type SlackDeliveryPayload = {
  text: string;
};

type FetchLike = typeof fetch;
type SleepLike = (durationMs: number) => Promise<void>;

export type DeliveryAttemptResult =
  | {
      attempts: number;
      status: "success";
      responseStatus: number;
    }
  | {
      attempts: number;
      status: "error";
      error: string;
    };

const DELIVERY_RETRY_BASE_DELAY_MS = 250;
const DELIVERY_RETRY_MAX_DELAY_MS = 2_000;

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function getDeliveryRetryDelayMs(attempt: number) {
  return Math.min(
    DELIVERY_RETRY_MAX_DELAY_MS,
    DELIVERY_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
}

function formatDeliveryFailureMessage(error: string, attempts: number) {
  return `${error} Delivery failed after ${attempts} attempt${
    attempts === 1 ? "" : "s"
  }.`;
}

export async function buildDeliveryPayload(input: {
  channel: "webhook";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
}): Promise<DeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "slack";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
}): Promise<SlackDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: DeliveryChannel;
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
}): Promise<DeliveryPayload | SlackDeliveryPayload> {
  switch (input.channel) {
    case "slack":
      return {
        text: `${input.brief.title}\n${input.brief.summary}`,
      };
    default:
      return {
        briefId: input.brief.id,
        format: "html" as const,
        title: input.brief.title,
        html: input.html ?? "",
      };
  }
}

export async function deliverBriefDigest(input: {
  endpoint: string;
  payload: DeliveryPayload;
  fetchImpl?: FetchLike;
}): Promise<number> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(input.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input.payload),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const message = responseText
      ? `Webhook delivery failed with status ${response.status}: ${responseText}`
      : `Webhook delivery failed with status ${response.status}`;

    throw new Error(message);
  }

  return response.status;
}

export async function deliverBriefWithRetry(input: {
  endpoint: string;
  payload: DeliveryPayload;
  fetchImpl?: FetchLike;
  maxAttempts?: number;
  sleepImpl?: SleepLike;
}): Promise<DeliveryAttemptResult> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 1);
  const sleepImpl = input.sleepImpl ?? sleep;
  let lastError = "Unknown delivery failure.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const responseStatus = await deliverBriefDigest(input);

      return {
        attempts: attempt,
        status: "success",
        responseStatus,
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Unknown delivery failure.";

      if (attempt < maxAttempts) {
        await sleepImpl(getDeliveryRetryDelayMs(attempt));
      }
    }
  }

  return {
    attempts: maxAttempts,
    status: "error",
    error: lastError,
  };
}

export async function deliverStoredBrief(
  store: Store,
  briefId: string,
  options?: {
    fetchImpl?: FetchLike;
    maxAttempts?: number;
    sleepImpl?: SleepLike;
  },
) {
  const brief = await getBriefById(store, briefId);

  if (!brief) {
    throw new Error("Brief not found.");
  }

  const settings = await getWebhookSettings(store);

  if (!settings.endpoint) {
    throw new Error("Configure a webhook endpoint first.");
  }

  const linkedItems = await listItemsByBriefId(store, briefId);
  const html = renderBriefHtmlDigest({ brief, linkedItems });
  const logId = await createDeliveryLog(store, {
    briefId,
    endpoint: settings.endpoint,
    payloadType: "html",
  });

  const result = await deliverBriefWithRetry({
    endpoint: settings.endpoint,
    payload: await buildDeliveryPayload({
      channel: "webhook",
      brief: {
        id: briefId,
        title: brief.title,
        summary: brief.summary,
      },
      html,
    }),
    fetchImpl: options?.fetchImpl,
    maxAttempts: options?.maxAttempts,
    sleepImpl: options?.sleepImpl,
  });

  if (result.status === "success") {
    await finishDeliveryLog(store, {
      logId,
      status: "success",
      responseStatus: result.responseStatus,
    });

    return {
      logId,
      ...result,
    };
  }

  await finishDeliveryLog(store, {
    logId,
    status: "error",
    error: formatDeliveryFailureMessage(result.error, result.attempts),
  });

  return {
    logId,
    ...result,
  };
}
