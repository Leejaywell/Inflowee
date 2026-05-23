import { z } from "zod";

export const createSpaceSchema = z.object({
  name: z.string().trim().min(2, "Space name must be at least 2 characters."),
  description: z
    .string()
    .trim()
    .max(240, "Description must be 240 characters or fewer.")
    .optional()
    .transform((value) => value || undefined),
});

export const createTaskSchema = z.object({
  spaceId: z.string().trim().min(1, "Select a space."),
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

        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Enter a valid http or https URL."),
}).superRefine((value, context) => {
  try {
    const url = new URL(value.url);

    if (value.sourceType === "NEWSLETTER" && url.protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Enter a valid https URL.",
      });
    }

    if (value.sourceType === "TELEGRAM_PUBLIC") {
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

export const spaceMemberSchema = z.object({
  spaceId: z.string().trim().min(1, "Select a space."),
  userId: z.string().trim().min(2, "Enter a user ID."),
  role: z.enum(["viewer", "editor"]),
});
