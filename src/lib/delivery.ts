import { renderBriefHtmlDigest } from "@/lib/brief-render";
import {
  createDeliveryLog,
  getSlackSettings,
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
  blocks: Array<Record<string, unknown>>;
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
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: input.brief.title,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: input.brief.summary,
            },
          },
        ],
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
  payload: DeliveryPayload | SlackDeliveryPayload;
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
  payload: DeliveryPayload | SlackDeliveryPayload;
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

export async function deliverStoredBriefToChannel(
  store: Store,
  briefId: string,
  channel: DeliveryChannel,
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

  const linkedItems = await listItemsByBriefId(store, briefId);
  const html = renderBriefHtmlDigest({ brief, linkedItems });
  const endpointSettings =
    channel === "slack"
      ? await getSlackSettings(store)
      : await getWebhookSettings(store);

  if (!endpointSettings.endpoint) {
    throw new Error(
      channel === "slack"
        ? "Configure a Slack webhook endpoint first."
        : "Configure a webhook endpoint first.",
    );
  }

  const payloadType = channel === "slack" ? "slack" : "html";
  const logId = await createDeliveryLog(store, {
    briefId,
    endpoint: endpointSettings.endpoint,
    payloadType,
  });

  const payload =
    channel === "slack"
      ? await buildDeliveryPayload({
          channel: "slack",
          brief: {
            id: briefId,
            title: brief.title,
            summary: brief.summary,
          },
        })
      : await buildDeliveryPayload({
          channel: "webhook",
          brief: {
            id: briefId,
            title: brief.title,
            summary: brief.summary,
          },
          html,
        });

  const result = await deliverBriefWithRetry({
    endpoint: endpointSettings.endpoint,
    payload,
    fetchImpl: options?.fetchImpl,
    maxAttempts: options?.maxAttempts,
    sleepImpl: options?.sleepImpl,
  });

  if (result.status === "success") {
    await finishDeliveryLog(store, {
      logId,
      status: "success",
      attemptCount: result.attempts,
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
    attemptCount: result.attempts,
    error: result.error,
  });

  return {
    logId,
    ...result,
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
  return deliverStoredBriefToChannel(store, briefId, "webhook", options);
}

export async function deliverStoredBriefToConfiguredChannels(
  store: Store,
  briefId: string,
  options?: {
    fetchImpl?: FetchLike;
    maxAttempts?: number;
    sleepImpl?: SleepLike;
  },
) {
  const [webhookSettings, slackSettings] = await Promise.all([
    getWebhookSettings(store),
    getSlackSettings(store),
  ]);
  const channels: DeliveryChannel[] = [];

  if (webhookSettings.endpoint) {
    channels.push("webhook");
  }
  if (slackSettings.endpoint) {
    channels.push("slack");
  }

  if (channels.length === 0) {
    throw new Error("Configure at least one delivery channel first.");
  }

  const deliveries = [];

  for (const channel of channels) {
    deliveries.push(
      await deliverStoredBriefToChannel(store, briefId, channel, options),
    );
  }

  return {
    status: deliveries.every((delivery) => delivery.status === "success")
      ? "success"
      : "error",
    deliveries,
  } as const;
}
