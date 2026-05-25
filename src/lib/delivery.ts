import { renderBriefHtmlDigest } from "@/lib/brief-render";
import nodemailer from "nodemailer";
import {
  maybeCreateHtmlPublicationForDelivery,
  type HtmlPushDeliveryResult,
} from "@/lib/html-push";
import {
  createDeliveryLog,
  getBarkSettings,
  getDefaultDeliveryChannels,
  getDeliveryTemplate,
  getDingTalkSettings,
  getEmailSettings,
  getFeishuSettings,
  getNtfySettings,
  getSlackSettings,
  getTelegramSettings,
  getWechatSettings,
  finishDeliveryLog,
  getBriefById,
  getTopicById,
  getWeComSettings,
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
  htmlUrl?: string;
};

export type DeliveryChannel =
  | "webhook"
  | "slack"
  | "telegram"
  | "feishu"
  | "ntfy"
  | "dingtalk"
  | "wecom"
  | "bark"
  | "email"
  | "wechat";
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
export type DingTalkDeliveryPayload = {
  msgtype: "text";
  text: {
    content: string;
  };
};
export type WeComDeliveryPayload = {
  msgtype: "text";
  text: {
    content: string;
  };
};
export type BarkDeliveryPayload = {
  title: string;
  body: string;
};
export type EmailDeliveryPayload = {
  subject: string;
  text: string;
  html?: string;
};
export type WechatDeliveryPayload = {
  _wechat: true;
  baseUrl: string;
  token: string;
  toUserId: string;
  text: string;
};

export type DeliveryPayloadUnion =
  | DeliveryPayload
  | SlackDeliveryPayload
  | TelegramDeliveryPayload
  | FeishuDeliveryPayload
  | NtfyDeliveryPayload
  | DingTalkDeliveryPayload
  | WeComDeliveryPayload
  | BarkDeliveryPayload
  | EmailDeliveryPayload
  | WechatDeliveryPayload;

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
    contentType?: "brief" | "report" | "message";
    htmlUrl?: string | null;
  }): Promise<DeliveryPayloadUnion[]>;
  missingConfigurationMessage: string;
};

type FetchLike = typeof fetch;
type SleepLike = (durationMs: number) => Promise<void>;

type DeliveryChannelSettings = {
  endpoint: string | null;
  updatedAt: string | null;
};

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

function isEmailPayload(payload: DeliveryPayloadUnion): payload is EmailDeliveryPayload {
  return "subject" in payload && "text" in payload;
}

function isWechatPayload(payload: DeliveryPayloadUnion): payload is WechatDeliveryPayload {
  return "_wechat" in payload && (payload as WechatDeliveryPayload)._wechat === true;
}

async function deliverWechatMessage(payload: WechatDeliveryPayload): Promise<number> {
  const baseUrl = payload.baseUrl.endsWith("/") ? payload.baseUrl : `${payload.baseUrl}/`;
  const xWechatUin = Buffer.from(
    String(Math.floor(Math.random() * 0xffffffff)),
    "utf-8",
  ).toString("base64");

  const body = {
    msg: {
      to_user_id: payload.toUserId,
      item_list: [{ type: 1, text_item: { text: payload.text } }],
    },
    base_info: {},
  };

  const response = await fetch(`${baseUrl}ilink/bot/sendmessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      Authorization: `Bearer ${payload.token}`,
      "X-WECHAT-UIN": xWechatUin,
      "iLink-App-Id": "bot",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      responseText
        ? `WeChat delivery failed (${response.status}): ${responseText}`
        : `WeChat delivery failed with status ${response.status}`,
    );
  }

  return response.status;
}

function renderTemplate(
  template: string,
  input: {
    title: string;
    summary: string;
    contentType?: "brief" | "report" | "message";
  },
) {
  return template
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{summary}}", input.summary)
    .replaceAll("{{contentType}}", input.contentType ?? "brief")
    .trim();
}

export function appendHtmlUrlToDeliveryText(input: {
  text: string;
  htmlUrl?: string | null;
  locale?: "zh" | "en";
}) {
  if (!input.htmlUrl) {
    return input.text;
  }

  const label =
    input.locale === "en"
      ? "View full HTML summary:"
      : "查看完整 HTML 摘要：";

  return `${input.text.trim()}\n\n${label}${input.locale === "en" ? " " : ""}${input.htmlUrl}`;
}

async function deliverEmailSmtp(
  endpoint: string,
  payload: EmailDeliveryPayload,
) {
  const url = new URL(endpoint);
  const secure = url.protocol === "smtps:";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") {
    throw new Error("Email delivery requires an smtp:// or smtps:// endpoint.");
  }
  if (!from || !to) {
    throw new Error("Email SMTP endpoint must include from and to query parameters.");
  }

  const transporter = nodemailer.createTransport({
    host: url.hostname,
    port: url.port ? Number(url.port) : secure ? 465 : 587,
    secure,
    auth: url.username
      ? {
          user: decodeURIComponent(url.username),
          pass: decodeURIComponent(url.password),
        }
      : undefined,
  });

  await transporter.sendMail({
    from,
    to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  return 250;
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

export async function renderDeliveryBody(
  store: Store,
  input: {
    title: string;
    summary: string;
    contentType?: "brief" | "report" | "message";
  },
) {
  const settings = await getDeliveryTemplate(store);

  if (!settings.template) {
    return input.summary;
  }

  const rendered = renderTemplate(settings.template, input);
  return rendered || input.summary;
}

export async function buildDeliveryPayload(input: {
  channel: "webhook";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
  htmlUrl?: string | null;
}): Promise<DeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "slack";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
  htmlUrl?: string | null;
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
  htmlUrl?: string | null;
}): Promise<TelegramDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "feishu";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
  htmlUrl?: string | null;
}): Promise<FeishuDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "ntfy";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
  htmlUrl?: string | null;
}): Promise<NtfyDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "dingtalk";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
  htmlUrl?: string | null;
}): Promise<DingTalkDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "wecom";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
  htmlUrl?: string | null;
}): Promise<WeComDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "bark";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
  htmlUrl?: string | null;
}): Promise<BarkDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "email";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  html?: string;
  htmlUrl?: string | null;
}): Promise<EmailDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: "wechat";
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  baseUrl: string;
  token: string;
  toUserId: string;
  html?: string;
  htmlUrl?: string | null;
}): Promise<WechatDeliveryPayload>;
export async function buildDeliveryPayload(input: {
  channel: DeliveryChannel;
  brief: {
    id: string;
    title: string;
    summary: string;
  };
  chatId?: string;
  baseUrl?: string;
  token?: string;
  toUserId?: string;
  html?: string;
  htmlUrl?: string | null;
}): Promise<DeliveryPayloadUnion> {
  const summary = appendHtmlUrlToDeliveryText({
    text: input.brief.summary,
    htmlUrl: input.htmlUrl,
  });

  switch (input.channel) {
    case "slack":
      return {
        text: `${input.brief.title}\n${summary}`,
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
              text: summary,
            },
          },
        ],
      };
    case "telegram":
      return {
        chat_id: input.chatId ?? "",
        text: `<b>${input.brief.title}</b>\n${summary}`,
        parse_mode: "HTML",
      };
    case "feishu":
      return {
        msg_type: "text",
        content: {
          text: `${input.brief.title}\n${summary}`,
        },
      };
    case "ntfy":
      return {
        title: input.brief.title,
        message: summary,
      };
    case "dingtalk":
      return {
        msgtype: "text",
        text: {
          content: `${input.brief.title}\n${summary}`,
        },
      };
    case "wecom":
      return {
        msgtype: "text",
        text: {
          content: `${input.brief.title}\n${summary}`,
        },
      };
    case "bark":
      return {
        title: input.brief.title,
        body: summary,
      };
    case "email":
      return {
        subject: input.brief.title,
        text: summary,
        html: input.html,
      };
    case "wechat":
      return {
        _wechat: true,
        baseUrl: input.baseUrl ?? "",
        token: input.token ?? "",
        toUserId: input.toUserId ?? "",
        text: `${input.brief.title}\n${summary}`,
      };
    default:
      return {
        briefId: input.brief.id,
        format: "html" as const,
        title: input.brief.title,
        html: input.html ?? "",
        ...(input.htmlUrl ? { htmlUrl: input.htmlUrl } : {}),
      };
  }
}

export async function deliverBriefDigest(input: {
  endpoint: string;
  payload: DeliveryPayloadUnion;
  fetchImpl?: FetchLike;
}): Promise<number> {
  if (isEmailPayload(input.payload)) {
    return deliverEmailSmtp(input.endpoint, input.payload);
  }

  if (isWechatPayload(input.payload)) {
    return deliverWechatMessage(input.payload);
  }

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
    async buildPayloads({ brief, html, htmlUrl }) {
      return [
        await buildDeliveryPayload({ channel: "webhook", brief, html, htmlUrl }),
      ];
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
    async buildPayloads({ brief, store, contentType, htmlUrl }) {
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      return [
        await buildDeliveryPayload({
          channel: "slack",
          brief: { ...brief, summary },
          htmlUrl,
        }),
      ];
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
    async buildPayloads({ brief, store, contentType, htmlUrl }) {
      const settings = await getTelegramSettings(store);
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      return [
        await buildDeliveryPayload({
          channel: "telegram",
          brief: { ...brief, summary },
          chatId: settings.chatId ?? "",
          htmlUrl,
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
    async buildPayloads({ brief, store, contentType, htmlUrl }) {
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      return [
        await buildDeliveryPayload({
          channel: "feishu",
          brief: { ...brief, summary },
          htmlUrl,
        }),
      ];
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
    async buildPayloads({ brief, store, contentType, htmlUrl }) {
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      const text = appendHtmlUrlToDeliveryText({ text: summary, htmlUrl });
      return splitDeliveryText(text, 4_000).map((message) => ({
        title: brief.title,
        message,
      }));
    },
    missingConfigurationMessage: "Configure an ntfy endpoint first.",
  },
  {
    type: "dingtalk",
    name: "DingTalk",
    payloadType: "dingtalk",
    formatGuide: {
      contentTypes: ["plain", "json"],
      maxPayloadCharacters: 16_000,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Prefix the text body with the brief title.",
    },
    async getEndpoint(store) {
      return (await getDingTalkSettings(store)).endpoint;
    },
    async buildPayloads({ brief, store, contentType, htmlUrl }) {
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      return [
        await buildDeliveryPayload({
          channel: "dingtalk",
          brief: { ...brief, summary },
          htmlUrl,
        }),
      ];
    },
    missingConfigurationMessage: "Configure a DingTalk webhook endpoint first.",
  },
  {
    type: "wecom",
    name: "WeCom",
    payloadType: "wecom",
    formatGuide: {
      contentTypes: ["plain", "json"],
      maxPayloadCharacters: 16_000,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Prefix the text body with the brief title.",
    },
    async getEndpoint(store) {
      return (await getWeComSettings(store)).endpoint;
    },
    async buildPayloads({ brief, store, contentType, htmlUrl }) {
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      return [
        await buildDeliveryPayload({
          channel: "wecom",
          brief: { ...brief, summary },
          htmlUrl,
        }),
      ];
    },
    missingConfigurationMessage: "Configure a WeCom webhook endpoint first.",
  },
  {
    type: "bark",
    name: "Bark",
    payloadType: "bark",
    formatGuide: {
      contentTypes: ["plain", "json"],
      maxPayloadCharacters: 4_000,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Use the brief title as the notification title.",
    },
    async getEndpoint(store) {
      return (await getBarkSettings(store)).endpoint;
    },
    async buildPayloads({ brief, store, contentType, htmlUrl }) {
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      const text = appendHtmlUrlToDeliveryText({ text: summary, htmlUrl });
      return splitDeliveryText(text, 4_000).map((body) => ({
        title: brief.title,
        body,
      }));
    },
    missingConfigurationMessage: "Configure a Bark endpoint first.",
  },
  {
    type: "email",
    name: "Email SMTP relay",
    payloadType: "email",
    formatGuide: {
      contentTypes: ["plain", "html", "json"],
      maxPayloadCharacters: 80_000,
      supportsLinks: true,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Use the brief title as the email subject.",
    },
    async getEndpoint(store) {
      return (await getEmailSettings(store)).endpoint;
    },
    async buildPayloads({ brief, html, store, contentType, htmlUrl }) {
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      return [
        await buildDeliveryPayload({
          channel: "email",
          brief: { ...brief, summary },
          html,
          htmlUrl,
        }),
      ];
    },
    missingConfigurationMessage: "Configure an email SMTP relay endpoint first.",
  },
  {
    type: "wechat",
    name: "WeChat (ilink)",
    payloadType: "wechat",
    formatGuide: {
      contentTypes: ["plain"],
      maxPayloadCharacters: 4_000,
      supportsLinks: false,
      supportsButtons: false,
      batchSeparator: "\n\n",
      titleRule: "Prefix the plain text body with the brief title.",
    },
    async getEndpoint(store) {
      const settings = await getWechatSettings(store);
      return settings.baseUrl && settings.token && settings.toUserId ? settings.baseUrl : null;
    },
    async buildPayloads({ brief, store, contentType, htmlUrl }) {
      const settings = await getWechatSettings(store);
      const summary = await renderDeliveryBody(store, { ...brief, contentType });
      const text = appendHtmlUrlToDeliveryText({ text: `${brief.title}\n${summary}`, htmlUrl });
      return [
        {
          _wechat: true as const,
          baseUrl: settings.baseUrl ?? "",
          token: settings.token ?? "",
          toUserId: settings.toUserId ?? "",
          text,
        },
      ];
    },
    missingConfigurationMessage: "Configure WeChat (ilink) delivery first.",
  },
];

function getDeliveryAdapter(channel: DeliveryChannel) {
  const adapter = DELIVERY_ADAPTERS.find((candidate) => candidate.type === channel);

  if (!adapter) {
    throw new Error(`Unsupported delivery channel: ${channel}`);
  }

  return adapter;
}

function getHtmlPushLogFields(result?: HtmlPushDeliveryResult): {
  htmlPublicationId?: string | null;
  htmlUrl?: string | null;
  htmlStatus?: "skipped" | "pending" | "published" | "failed" | null;
} {
  if (!result) {
    return {};
  }

  if (result.status === "published") {
    return {
      htmlPublicationId: result.publicationId,
      htmlUrl: result.htmlUrl,
      htmlStatus: "published",
    };
  }

  if (result.status === "failed") {
    return {
      htmlPublicationId: result.publicationId ?? null,
      htmlStatus: "failed",
    };
  }

  return { htmlStatus: "skipped" };
}

function getHtmlUrlFromPushResult(result?: HtmlPushDeliveryResult) {
  return result?.status === "published" ? result.htmlUrl : null;
}

async function getDeliveryChannelSettings(
  store: Store,
  channel: DeliveryChannel,
): Promise<DeliveryChannelSettings> {
  if (channel === "webhook") {
    return getWebhookSettings(store);
  }

  if (channel === "slack") {
    return getSlackSettings(store);
  }

  if (channel === "telegram") {
    const settings = await getTelegramSettings(store);

    return {
      endpoint: settings.botToken && settings.chatId ? settings.botToken : null,
      updatedAt: settings.updatedAt,
    };
  }

  if (channel === "feishu") {
    return getFeishuSettings(store);
  }

  if (channel === "ntfy") {
    return getNtfySettings(store);
  }

  if (channel === "dingtalk") {
    return getDingTalkSettings(store);
  }

  if (channel === "wecom") {
    return getWeComSettings(store);
  }

  if (channel === "bark") {
    return getBarkSettings(store);
  }

  if (channel === "wechat") {
    const settings = await getWechatSettings(store);
    return {
      endpoint: settings.baseUrl && settings.token && settings.toUserId ? settings.baseUrl : null,
      updatedAt: settings.updatedAt,
    };
  }

  return getEmailSettings(store);
}

export async function listConfiguredDeliveryChannels(store: Store) {
  const configured = await Promise.all(
    DELIVERY_ADAPTERS.map(async (adapter) => {
      const settings = await getDeliveryChannelSettings(store, adapter.type);

      return {
        type: adapter.type,
        name: adapter.name,
        payloadType: adapter.payloadType,
        formatGuide: adapter.formatGuide,
        enabled: Boolean(settings.endpoint),
        updatedAt: settings.updatedAt,
      };
    }),
  );

  return configured;
}

export async function listDeliveryChannelsForTopic(
  store: Store,
  topicId: string | null | undefined,
) {
  const channels = await listConfiguredDeliveryChannels(store);

  if (!topicId) {
    return channels.filter((channel) => channel.enabled);
  }

  const topic = await getTopicById(store, topicId);
  const overrides = topic?.deliveryChannels?.filter(Boolean) ?? [];

  if (overrides.length === 0) {
    const defaults = await getDefaultDeliveryChannels(store);
    const defaultChannels = defaults.channels.filter(Boolean);

    if (defaultChannels.length > 0) {
      return channels.filter(
        (channel) => channel.enabled && defaultChannels.includes(channel.type),
      );
    }

    return channels.filter((channel) => channel.enabled);
  }

  return channels.filter(
    (channel) => channel.enabled && overrides.includes(channel.type),
  );
}

export async function deliverStoredBriefToChannel(
  store: Store,
  briefId: string,
  channel: DeliveryChannel,
  options?: {
    fetchImpl?: FetchLike;
    htmlPushResult?: HtmlPushDeliveryResult;
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

  const htmlPushResult =
    options?.htmlPushResult ??
    (await maybeCreateHtmlPublicationForDelivery(
      store,
      { contentType: "brief", briefId },
      { fetchImpl: options?.fetchImpl },
    ));
  const payloads = await adapter.buildPayloads({
    brief: {
      id: briefId,
      title: brief.title,
      summary: brief.summary,
    },
    html,
    store,
    contentType: "brief",
    htmlUrl: getHtmlUrlFromPushResult(htmlPushResult),
  });
  const logId = await createDeliveryLog(store, {
    briefId,
    endpoint,
    payloadType: adapter.payloadType,
    ...getHtmlPushLogFields(htmlPushResult),
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
        ...getHtmlPushLogFields(htmlPushResult),
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
    ...getHtmlPushLogFields(htmlPushResult),
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
    htmlPushResult?: HtmlPushDeliveryResult;
    maxAttempts?: number;
    sleepImpl?: SleepLike;
  },
) {
  return deliverStoredBriefToChannel(store, briefId, "webhook", options);
}

export async function deliverTextToChannel(
  store: Store,
  channel: DeliveryChannel,
  input: {
    id: string;
    title: string;
    body: string;
    contentType?: "report" | "message";
  },
  options?: {
    fetchImpl?: FetchLike;
    htmlPushResult?: HtmlPushDeliveryResult;
    maxAttempts?: number;
    sleepImpl?: SleepLike;
  },
) {
  const adapter = getDeliveryAdapter(channel);
  const endpoint = await adapter.getEndpoint(store);

  if (!endpoint) {
    throw new Error(adapter.missingConfigurationMessage);
  }

  const htmlPushResult =
    input.contentType === "report"
      ? (options?.htmlPushResult ??
        (await maybeCreateHtmlPublicationForDelivery(
          store,
          { contentType: "report", reportId: input.id },
          { fetchImpl: options?.fetchImpl },
        ).catch((error) => ({
          status: "failed" as const,
          error:
            error instanceof Error
              ? error.message
              : "Unknown HTML publish failure.",
        }))))
      : undefined;
  const payloads = await adapter.buildPayloads({
    brief: {
      id: input.id,
      title: input.title,
      summary: input.body,
    },
    html: input.body,
    store,
    contentType: input.contentType ?? "message",
    htmlUrl: getHtmlUrlFromPushResult(htmlPushResult),
  });
  const logId = await createDeliveryLog(store, {
    contentType: input.contentType ?? "message",
    contentId: input.id,
    endpoint,
    payloadType: adapter.payloadType,
    ...getHtmlPushLogFields(htmlPushResult),
  });
  let attempts = 0;
  let responseStatus = 0;

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
        ...getHtmlPushLogFields(htmlPushResult),
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
    ...getHtmlPushLogFields(htmlPushResult),
  });

  return {
    logId,
    attempts,
    status: "success" as const,
    responseStatus,
  };
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
  const brief = await getBriefById(store, briefId);
  const channels = (await listDeliveryChannelsForTopic(store, brief?.topicId)).map(
    (channel) => channel.type,
  );

  if (channels.length === 0) {
    throw new Error("Configure at least one delivery channel first.");
  }

  const deliveries = [];
  const htmlPushResult = await maybeCreateHtmlPublicationForDelivery(
    store,
    { contentType: "brief", briefId },
    { fetchImpl: options?.fetchImpl },
  );

  for (const channel of channels) {
    deliveries.push(
      await deliverStoredBriefToChannel(store, briefId, channel, {
        ...options,
        htmlPushResult,
      }),
    );
  }

  return {
    status: deliveries.every((delivery) => delivery.status === "success")
      ? "success"
      : "error",
    deliveries,
  } as const;
}
