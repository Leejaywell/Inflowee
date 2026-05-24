import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(2, "Task title must be at least 2 characters."),
  taskType: z.enum(["TOPIC", "QUESTION"]),
  userPrompt: z
    .string()
    .trim()
    .min(8, "Prompt must be at least 8 characters.")
    .max(600, "Prompt must be 600 characters or fewer."),
});

export const createSourceSchema = z.object({
  taskId: z.string().trim().min(1, "Select a task."),
  sourceType: z.enum([
    "RSS",
    "PAGE",
    "STRUCTURED",
    "UPDATE",
    "NEWSLETTER",
    "TELEGRAM_PUBLIC",
    "TELEGRAM_BOT",
    "SEARCH_DISCOVERY",
    "COMMUNITY_DISCOVERY",
    "SOCIAL_DISCOVERY",
    "HOTLIST_DISCOVERY",
  ]),
  title: z
    .string()
    .trim()
    .min(2, "Source title must be at least 2 characters."),
  url: z
    .string()
    .trim()
    .refine((value) => {
      try {
        const url = new URL(value);

        return (
          url.protocol === "http:" ||
          url.protocol === "https:" ||
          url.protocol === "radar:"
        );
      } catch {
        return false;
      }
    }, "Enter a valid http, https, or radar URL."),
}).superRefine((value, context) => {
  try {
    const url = new URL(value.url);

    if (
      (value.sourceType === "SEARCH_DISCOVERY" ||
        value.sourceType === "COMMUNITY_DISCOVERY" ||
        value.sourceType === "SOCIAL_DISCOVERY" ||
        value.sourceType === "HOTLIST_DISCOVERY") &&
      url.protocol !== "radar:"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Discovery sources must use a radar URL.",
      });
    }

    if (value.sourceType === "NEWSLETTER" && url.protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Enter a valid https URL.",
      });
    }

    if (
      value.sourceType === "TELEGRAM_PUBLIC" ||
      value.sourceType === "TELEGRAM_BOT"
    ) {
      const hostname = url.hostname.toLowerCase();
      const validHostnames = new Set([
        "t.me",
        "www.t.me",
        "telegram.me",
        "www.telegram.me",
      ]);
      const slug = url.pathname
        .split("/")
        .filter(Boolean)
        .filter((segment) => segment !== "s")[0];

      if (url.protocol !== "https:" || !validHostnames.has(hostname) || !slug) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "Enter a valid public Telegram channel or group URL.",
        });
      }
    }
  } catch {
    // Base schema already reports invalid URLs.
  }
});

export const updateSourceScheduleSchema = z.object({
  sourceId: z.string().trim().min(1, "Select a source."),
  syncIntervalMinutes: z.coerce
    .number()
    .int()
    .min(15, "Sync cadence must be at least 15 minutes.")
    .max(1440, "Sync cadence must be 1440 minutes or fewer."),
});

export const webhookEndpointSchema = z
  .string()
  .trim()
  .url("Enter a valid webhook URL.")
  .refine(
    (value) => value.startsWith("https://"),
    "Enter a valid https webhook URL.",
  );

export const slackWebhookEndpointSchema = z
  .string()
  .trim()
  .url("Enter a valid Slack webhook URL.")
  .refine((value) => value.startsWith("https://"), "Enter a valid https Slack webhook URL.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["hooks.slack.com", "hooks.slack-gov.com"].includes(url.hostname);
    } catch {
      return false;
    }
  }, "Slack webhooks must use hooks.slack.com or hooks.slack-gov.com.");

export const telegramSettingsSchema = z.object({
  botToken: z
    .string()
    .trim()
    .min(10, "Enter a valid Telegram bot token.")
    .regex(/^\d+:[A-Za-z0-9_-]+$/, "Enter a valid Telegram bot token."),
  chatId: z
    .string()
    .trim()
    .min(1, "Enter a Telegram chat ID.")
    .regex(/^-?\d+$/, "Enter a valid Telegram chat ID."),
});

export const telegramSourceSettingsSchema = z.object({
  botToken: z
    .string()
    .trim()
    .min(10, "Enter a valid Telegram source bot token.")
    .regex(/^\d+:[A-Za-z0-9_-]+$/, "Enter a valid Telegram source bot token."),
});

export const feishuWebhookEndpointSchema = z
  .string()
  .trim()
  .url("Enter a valid Feishu webhook URL.")
  .refine((value) => value.startsWith("https://"), "Enter a valid https Feishu webhook URL.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["open.feishu.cn", "open.larksuite.com"].includes(url.hostname);
    } catch {
      return false;
    }
  }, "Feishu webhooks must use open.feishu.cn or open.larksuite.com.");

export const ntfyEndpointSchema = z
  .string()
  .trim()
  .url("Enter a valid ntfy endpoint URL.")
  .refine(
    (value) => value.startsWith("https://"),
    "Enter a valid https ntfy endpoint URL.",
  );

export const deliveryEndpointSchema = z
  .string()
  .trim()
  .url("Enter a valid delivery endpoint URL.")
  .refine(
    (value) => value.startsWith("https://"),
    "Enter a valid https delivery endpoint URL.",
  );
