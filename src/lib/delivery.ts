import { renderBriefHtmlDigest } from "@/lib/brief-render";
import {
  createDeliveryLog,
  getFeishuSettings,
  getNtfySettings,
  getSlackSettings,
  getTelegramSettings,
  finishDeliveryLog,
  getBriefById,
  getWebhookSettings,
  listItemsByBriefId,
  type DeliveryPayloadType,
  type Store,
} from "@/lib/store";

export type DeliveryPayload = {
  briefId: string;
  format: "html";
  title: string;
  html: string;
};

export type DeliveryChannel =
  | "webhook"
  | "slack"
  | "telegram"
  | "feishu"
  | "ntfy";
export type SlackDeliveryPayload = {
  text: string;
  blocks: Array<Record<string, unknown>>;
};
export type TelegramDeliveryPayload = {
  chat_id: string;
  text: string;
  parse_mode: "HTML";
};
export type FeishuDeliveryPayload = {
  msg_type: "text";
  content: {
    text: string;
  };
};
export type NtfyDeliveryPayload = {
  topic?: string;
  title: string;
  message: string;
};

export type DeliveryPayloadUnion =
  | DeliveryPayload
  | SlackDeliveryPayload
  | TelegramDeliveryPayload
  | FeishuDeliveryPayload
  | NtfyDeliveryPayload;

export type DeliveryFormatGuide = {
  contentTypes: Array<"plain" | "markdown" | "html" | "json">;
  maxPayloadCharacters: number;
  supportsLinks: boolean;
  supportsButtons: boolean;
  batchSeparator: string;
  titleRule: string;
};

type DeliveryAdapter = {
  type: DeliveryChannel;
  name: string;
  payloadType: DeliveryPayloadType;
  formatGuide: DeliveryFormatGuide;
  getEndpoint(store: Store): Promise<string | null>;
  buildPayloads(input: {
    brief: {
      id: string;
      title: string;
      summary: string;
    };
    html: string;
    store: Store;
  }): Promise<DeliveryPayloadUnion[]>;
  missingConfigurationMessage: string;
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

export function splitDeliveryText(
  text: string,
  maxCharacters: number,
): string[] {
  if (text.length <= maxCharacters) {
    return [text];
  }

  const batches: string[] = [];
  let remaining = text;

  while (remaining.length > maxCharacters) {
    const nextBreak = remaining.lastIndexOf("\n", maxCharacters);
    const end = nextBreak >= maxCharacters * 0.5 ? nextBreak : maxCharacters;
    batches.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }

  if (remaining) {
    batches.push(remaining);
  }

  return batches;
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
  channel: "telegram";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  chatId: string;
  html?: string;
}): Promise<TelegramDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "feishu";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
}): Promise<FeishuDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "ntfy";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
}): Promise<NtfyDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: DeliveryChannel;
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  chatId?: string;
  html?: string;
}): Promise<DeliveryPayloadUnion> {
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
    case "telegram":
      return {
        chat_id: input.chatId ?? "",
        text: `<b>${input.brief.title}</b>\n${input.brief.summary}`,
        parse_mode: "HTML",
      };
    case "feishu":
      return {
        msg_type: "text",
        content: {
          text: `${input.brief.title}\n${input.brief.summary}`,
        },
      };
    case "ntfy":
      return {
        title: input.brief.title,
        message: input.brief.summary,
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
  payload: DeliveryPayloadUnion;
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
  payload: DeliveryPayloadUnion;
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

export const DELIVERY_ADAPTERS: DeliveryAdapter[] = [
  {
    type: "webhook",
    name: "Generic webhook",
    payloadType: "html",
    formatGuide: {
      contentTypes: ["html", "json"],
      maxPayloadCharacters: 80_000,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Use the brief title as the payload title.",
    },
    async getEndpoint(store) {
      return (await getWebhookSettings(store)).endpoint;
    },
    async buildPayloads({ brief, html }) {
      return [await buildDeliveryPayload({ channel: "webhook", brief, html })];
    },
    missingConfigurationMessage: "Configure a webhook endpoint first.",
  },
  {
    type: "slack",
    name: "Slack",
    payloadType: "slack",
    formatGuide: {
      contentTypes: ["markdown", "json"],
      maxPayloadCharacters: 3_000,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Use the brief title as the header block.",
    },
    async getEndpoint(store) {
      return (await getSlackSettings(store)).endpoint;
    },
    async buildPayloads({ brief }) {
      return [await buildDeliveryPayload({ channel: "slack", brief })];
    },
    missingConfigurationMessage: "Configure a Slack webhook endpoint first.",
  },
  {
    type: "telegram",
    name: "Telegram",
    payloadType: "telegram",
    formatGuide: {
      contentTypes: ["html"],
      maxPayloadCharacters: 4_096,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Use bold HTML for the brief title.",
    },
    async getEndpoint(store) {
      const settings = await getTelegramSettings(store);
      return settings.botToken && settings.chatId
        ? `https://api.telegram.org/bot${settings.botToken}/sendMessage`
        : null;
    },
    async buildPayloads({ brief, store }) {
      const settings = await getTelegramSettings(store);
      return [
        await buildDeliveryPayload({
          channel: "telegram",
          brief,
          chatId: settings.chatId ?? "",
        }),
      ];
    },
    missingConfigurationMessage: "Configure Telegram delivery first.",
  },
  {
    type: "feishu",
    name: "Feishu",
    payloadType: "feishu",
    formatGuide: {
      contentTypes: ["plain", "json"],
      maxPayloadCharacters: 16_000,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Prefix the plain text body with the brief title.",
    },
    async getEndpoint(store) {
      return (await getFeishuSettings(store)).endpoint;
    },
    async buildPayloads({ brief }) {
      return [await buildDeliveryPayload({ channel: "feishu", brief })];
    },
    missingConfigurationMessage: "Configure a Feishu webhook endpoint first.",
  },
  {
    type: "ntfy",
    name: "ntfy",
    payloadType: "ntfy",
    formatGuide: {
      contentTypes: ["plain", "json"],
      maxPayloadCharacters: 4_000,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Use the brief title as the notification title.",
    },
    async getEndpoint(store) {
      return (await getNtfySettings(store)).endpoint;
    },
    async buildPayloads({ brief }) {
      return splitDeliveryText(brief.summary, 4_000).map((message) => ({
        title: brief.title,
        message,
      }));
    },
    missingConfigurationMessage: "Configure an ntfy endpoint first.",
  },
];

function getDeliveryAdapter(channel: DeliveryChannel) {
  const adapter = DELIVERY_ADAPTERS.find((candidate) => candidate.type === channel);

  if (!adapter) {
    throw new Error(`Unsupported delivery channel: ${channel}`);
  }

  return adapter;
}

export async function listConfiguredDeliveryChannels(store: Store) {
  const configured = await Promise.all(
    DELIVERY_ADAPTERS.map(async (adapter) => ({
      type: adapter.type,
      name: adapter.name,
      payloadType: adapter.payloadType,
      formatGuide: adapter.formatGuide,
      enabled: Boolean(await adapter.getEndpoint(store)),
    })),
  );

  return configured;
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
  const adapter = getDeliveryAdapter(channel);
  const endpoint = await adapter.getEndpoint(store);

  if (!endpoint) {
    throw new Error(adapter.missingConfigurationMessage);
  }

  const payloads = await adapter.buildPayloads({
    brief: {
      id: briefId,
      title: brief.title,
      summary: brief.summary,
    },
    html,
    store,
  });
  const logId = await createDeliveryLog(store, {
    briefId,
    endpoint,
    payloadType: adapter.payloadType,
  });
  let attempts = 0;
  let responseStatus: number | undefined;

  for (const payload of payloads) {
    const result = await deliverBriefWithRetry({
      endpoint,
      payload,
      fetchImpl: options?.fetchImpl,
      maxAttempts: options?.maxAttempts,
      sleepImpl: options?.sleepImpl,
    });

    attempts += result.attempts;

    if (result.status === "error") {
      await finishDeliveryLog(store, {
        logId,
        status: "error",
        attemptCount: attempts,
        error: result.error,
      });

      return {
        logId,
        ...result,
        attempts,
      };
    }

    responseStatus = result.responseStatus;
  }

  await finishDeliveryLog(store, {
    logId,
    status: "success",
    attemptCount: attempts,
    responseStatus,
  });

  return {
    logId,
    attempts,
    status: "success" as const,
    responseStatus: responseStatus ?? 0,
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
  const channels = (await listConfiguredDeliveryChannels(store))
    .filter((channel) => channel.enabled)
    .map((channel) => channel.type);

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
