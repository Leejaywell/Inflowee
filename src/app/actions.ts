"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  assertBriefAccess,
  assertSourceAccess,
  assertTaskAccess,
  clearSessionActorCookie,
  createOperatorSessionActor,
  hasConfiguredOperatorLogin,
  requireSessionActor,
  setSessionActorCookie,
} from "@/lib/auth";
import { deliverStoredBrief, deliverStoredBriefToChannel } from "@/lib/delivery";
import {
  createSourceRecord,
  createTaskRecord,
  defaultStore,
  deleteBrief as deleteBriefRecord,
  deleteSource as deleteSourceRecord,
  deleteTask as deleteTaskRecord,
  getBriefById,
  getFeishuSettings,
  getSlackSettings,
  getTelegramSettings,
  getWebhookSettings,
  hasTaskRecord,
  listSources,
  markBriefRead,
  markBriefUnread,
  saveFeishuSettings,
  saveNtfySettings,
  saveSlackSettings,
  saveTelegramSettings,
  saveTelegramSourceSettings,
  saveWebhookSettings,
  setSourceSchedule,
  updateTaskScheduleProfile,
} from "@/lib/store";
import { syncSourceById } from "@/lib/source-ingestion";
import { getSourcePresetById } from "@/lib/source-presets";
import { generateTaskReport } from "@/lib/reports";
import {
  buildSchedulePreset,
  validateScheduleProfile,
  type TaskSchedulePreset,
} from "@/lib/task-schedule";
import { refreshTaskIntelligence } from "@/lib/task-intelligence";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n";
import {
  APPEARANCE_COOKIE_NAME,
  THEME_COOKIE_NAME,
  normalizeAppearance,
  normalizeTheme,
} from "@/lib/theme";
import {
  createSourceSchema,
  createTaskSchema,
  feishuWebhookEndpointSchema,
  ntfyEndpointSchema,
  slackWebhookEndpointSchema,
  telegramSettingsSchema,
  telegramSourceSettingsSchema,
  updateSourceScheduleSchema,
  webhookEndpointSchema,
} from "@/lib/validation";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function getRedirectPath(value: string, fallback: string) {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }

  return value;
}

function normalizeSourceUrl(sourceType: string, url: string) {
  if (sourceType !== "TELEGRAM_PUBLIC" && sourceType !== "TELEGRAM_BOT") {
    return url;
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const slug = segments.find((segment) => segment !== "s");

    if (!slug) {
      return url;
    }

    parsed.pathname = `/s/${slug}`;
    parsed.search = "";
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return url;
  }
}

export async function signInAction(formData: FormData) {
  const email = getString(formData, "email");
  const loginCode = getString(formData, "loginCode");
  const redirectTo = getRedirectPath(getString(formData, "redirectTo"), "/");

  if (!hasConfiguredOperatorLogin()) {
    redirect("/login?error=Operator%20login%20is%20not%20configured.");
  }

  try {
    const actor = await createOperatorSessionActor({ email, loginCode });
    await setSessionActorCookie(actor);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign in.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTo);
}

export async function signOutAction() {
  await clearSessionActorCookie();
  redirect("/login?signedOut=1");
}

export async function setLocaleAction(formData: FormData) {
  const locale = normalizeLocale(getString(formData, "locale"));
  const redirectTo = getRedirectPath(getString(formData, "redirectTo"), "/");
  const cookieStore = await cookies();

  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(redirectTo);
}

export async function setThemeAction(formData: FormData) {
  const theme = normalizeTheme(getString(formData, "theme"));
  const appearance = normalizeAppearance(getString(formData, "appearance"));
  const redirectTo = getRedirectPath(getString(formData, "redirectTo"), "/");
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };

  cookieStore.set(THEME_COOKIE_NAME, theme, cookieOptions);
  cookieStore.set(APPEARANCE_COOKIE_NAME, appearance, cookieOptions);

  redirect(redirectTo);
}

export async function createTask(formData: FormData) {
  const actor = await requireSessionActor();
  const parsed = createTaskSchema.safeParse({
    title: getString(formData, "title"),
    taskType: getString(formData, "taskType") || "TOPIC",
    userPrompt: getString(formData, "userPrompt"),
  });

  if (!parsed.success) {
    redirect(
      `/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid task input.")}`,
    );
  }

  const taskId = await createTaskRecord(defaultStore, {
    ...parsed.data,
    ownerId: actor.id,
  });

  try {
    await refreshTaskIntelligence(defaultStore, taskId);
  } catch (error) {
    console.error(`Failed to initialize task intelligence for ${taskId}:`, error);
  }

  revalidatePath("/");
  redirect(`/tasks/${taskId}`);
}

export async function refreshStoredTaskIntelligence(taskId: string) {
  const actor = await requireSessionActor();
  await assertTaskAccess(defaultStore, { actorId: actor.id, taskId });

  await refreshTaskIntelligence(defaultStore, taskId);

  revalidatePath(`/tasks/${taskId}`);

  return { success: true };
}

export async function createSource(formData: FormData) {
  const actor = await requireSessionActor();
  const sourceType = getString(formData, "sourceType");
  const parsed = createSourceSchema.safeParse({
    taskId: getString(formData, "taskId"),
    sourceType,
    title: getString(formData, "title"),
    url: normalizeSourceUrl(sourceType, getString(formData, "url")),
  });

  if (!parsed.success) {
    redirect(
      `/sources?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid source input.")}`,
    );
  }

  if (!(await hasTaskRecord(defaultStore, parsed.data.taskId))) {
    redirect("/sources?error=Select%20a%20valid%20task.");
  }

  await assertTaskAccess(defaultStore, {
    actorId: actor.id,
    taskId: parsed.data.taskId,
  });

  let destination = "/sources?created=source";

  try {
    await createSourceRecord(defaultStore, parsed.data);
  } catch {
    destination = "/sources?error=Unable%20to%20create%20source.";
  }

  revalidatePath("/sources");
  revalidatePath(`/tasks/${parsed.data.taskId}`);
  redirect(destination);
}

export async function createPresetSource(formData: FormData) {
  const actor = await requireSessionActor();
  const taskId = getString(formData, "taskId");
  const presetId = getString(formData, "presetId");
  const preset = getSourcePresetById(presetId);

  if (!preset) {
    redirect("/sources?error=Unknown%20built-in%20source.");
  }

  if (!(await hasTaskRecord(defaultStore, taskId))) {
    redirect("/sources?error=Select%20a%20valid%20task.");
  }

  await assertTaskAccess(defaultStore, { actorId: actor.id, taskId });

  let destination = "/sources?created=source";

  try {
    await createSourceRecord(defaultStore, {
      taskId,
      sourceType: preset.sourceType,
      title: preset.title,
      url: preset.url,
      configJson: preset.configJson ?? null,
    });
  } catch {
    destination = "/sources?error=Unable%20to%20add%20built-in%20source.";
  }

  revalidatePath("/sources");
  revalidatePath(`/tasks/${taskId}`);
  redirect(destination);
}

export async function runSourceSync(formData: FormData) {
  const actor = await requireSessionActor();
  const sourceId = getString(formData, "sourceId");
  await assertSourceAccess(defaultStore, { actorId: actor.id, sourceId });
  const result = await syncSourceById(defaultStore, sourceId);

  if (!result.source) {
    redirect("/sources?error=Source%20not%20found.");
  }

  revalidatePath("/sources");
  revalidatePath(`/sources/${sourceId}`);
  revalidatePath(`/tasks/${result.source.taskId}`);
  revalidatePath("/inbox");

  if (!result.ok) {
    redirect(`/sources?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/sources?synced=source");
}

export async function updateSourceSchedule(formData: FormData) {
  const actor = await requireSessionActor();
  const parsed = updateSourceScheduleSchema.safeParse({
    sourceId: getString(formData, "sourceId"),
    syncIntervalMinutes: getString(formData, "syncIntervalMinutes"),
  });

  if (!parsed.success) {
    redirect(
      `/sources?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid schedule input.")}`,
    );
  }

  await assertSourceAccess(defaultStore, {
    actorId: actor.id,
    sourceId: parsed.data.sourceId,
  });

  await setSourceSchedule(
    defaultStore,
    parsed.data.sourceId,
    parsed.data.syncIntervalMinutes,
  );
  revalidatePath("/sources");
  redirect("/sources?updated=schedule");
}

export async function toggleBriefRead(formData: FormData) {
  const actor = await requireSessionActor();
  const briefId = getString(formData, "briefId");
  const isRead = getString(formData, "isRead");

  await assertBriefAccess(defaultStore, { actorId: actor.id, briefId });

  if (isRead === "1") {
    await markBriefUnread(defaultStore, briefId, actor.id);
  } else {
    await markBriefRead(defaultStore, briefId, actor.id);
  }

  revalidatePath("/inbox");
}

export async function deleteBrief(formData: FormData) {
  const actor = await requireSessionActor();
  const briefId = getString(formData, "briefId");
  await assertBriefAccess(defaultStore, { actorId: actor.id, briefId });
  await deleteBriefRecord(defaultStore, briefId);

  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function deleteSource(formData: FormData) {
  const actor = await requireSessionActor();
  const sourceId = getString(formData, "sourceId");
  await assertSourceAccess(defaultStore, { actorId: actor.id, sourceId });
  await deleteSourceRecord(defaultStore, sourceId);

  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/sources");
}

export async function deleteTask(formData: FormData) {
  const actor = await requireSessionActor();
  const taskId = getString(formData, "taskId");
  await assertTaskAccess(defaultStore, { actorId: actor.id, taskId });
  await deleteTaskRecord(defaultStore, taskId);

  revalidatePath("/");
  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/");
}

export async function runSyncAll() {
  const actor = await requireSessionActor();
  const sources = await listSources(defaultStore, { actorId: actor.id });
  let synced = 0;
  let failed = 0;

  for (const source of sources) {
    if (source.status === "error") {
      continue;
    }

    try {
      await assertSourceAccess(defaultStore, {
        actorId: actor.id,
        sourceId: source.id,
      });
    } catch {
      continue;
    }

    const result = await syncSourceById(defaultStore, source.id);

    if (result.ok) {
      synced += 1;
    } else {
      failed += 1;
    }
  }

  revalidatePath("/sources");
  revalidatePath("/inbox");

  if (failed > 0) {
    redirect(`/sources?error=Synced%20${synced}%20sources,%20but%20${failed}%20failed.`);
  }

  redirect("/sources?synced=all");
}

export async function generateReportAction(formData: FormData) {
  const actor = await requireSessionActor();
  const taskId = getString(formData, "taskId");
  const mode = getString(formData, "mode");

  if (mode !== "current" && mode !== "daily" && mode !== "incremental") {
    redirect(`/tasks/${taskId}?error=Invalid%20report%20mode.`);
  }

  await assertTaskAccess(defaultStore, { actorId: actor.id, taskId });
  await generateTaskReport(defaultStore, taskId, { mode });

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function saveTaskSchedulePresetAction(formData: FormData) {
  const actor = await requireSessionActor();
  const taskId = getString(formData, "taskId");
  const preset = getString(formData, "preset") as TaskSchedulePreset;
  const timezone = getString(formData, "timezone") || "Asia/Shanghai";
  const allowedPresets: TaskSchedulePreset[] = [
    "always_on",
    "morning_evening",
    "office_hours",
    "nightly_summary",
  ];

  if (!allowedPresets.includes(preset)) {
    redirect(`/tasks/${taskId}?error=Invalid%20schedule%20preset.`);
  }

  await assertTaskAccess(defaultStore, { actorId: actor.id, taskId });

  const profile = buildSchedulePreset(preset, timezone);
  const errors = validateScheduleProfile(profile);

  if (errors.length > 0) {
    redirect(`/tasks/${taskId}?error=${encodeURIComponent(errors[0])}`);
  }

  await updateTaskScheduleProfile(defaultStore, taskId, profile);

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function saveWebhookEndpoint(formData: FormData) {
  await requireSessionActor();
  const parsed = webhookEndpointSchema.safeParse(getString(formData, "endpoint"));

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid webhook endpoint.")}`,
    );
  }

  await saveWebhookSettings(defaultStore, parsed.data);
  revalidatePath("/settings");
  redirect("/settings?updated=webhook");
}

export async function saveSlackEndpoint(formData: FormData) {
  await requireSessionActor();
  const parsed = slackWebhookEndpointSchema.safeParse(getString(formData, "endpoint"));

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Slack webhook endpoint.")}`,
    );
  }

  await saveSlackSettings(defaultStore, parsed.data);
  revalidatePath("/settings");
  redirect("/settings?updated=slack");
}

export async function saveTelegramDelivery(formData: FormData) {
  await requireSessionActor();
  const parsed = telegramSettingsSchema.safeParse({
    botToken: getString(formData, "botToken"),
    chatId: getString(formData, "chatId"),
  });

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Telegram delivery settings.")}`,
    );
  }

  await saveTelegramSettings(defaultStore, parsed.data);
  revalidatePath("/settings");
  redirect("/settings?updated=telegram");
}

export async function saveTelegramSourceBot(formData: FormData) {
  await requireSessionActor();
  const parsed = telegramSourceSettingsSchema.safeParse({
    botToken: getString(formData, "botToken"),
  });

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Telegram source bot settings.")}`,
    );
  }

  await saveTelegramSourceSettings(defaultStore, parsed.data);
  revalidatePath("/settings");
  redirect("/settings?updated=telegram-source-bot");
}

export async function saveFeishuEndpoint(formData: FormData) {
  await requireSessionActor();
  const parsed = feishuWebhookEndpointSchema.safeParse(getString(formData, "endpoint"));

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Feishu webhook endpoint.")}`,
    );
  }

  await saveFeishuSettings(defaultStore, parsed.data);
  revalidatePath("/settings");
  redirect("/settings?updated=feishu");
}

export async function saveNtfyEndpoint(formData: FormData) {
  await requireSessionActor();
  const parsed = ntfyEndpointSchema.safeParse(getString(formData, "endpoint"));

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid ntfy endpoint.")}`,
    );
  }

  await saveNtfySettings(defaultStore, parsed.data);
  revalidatePath("/settings");
  redirect("/settings?updated=ntfy");
}

async function sendBriefToChannel(
  briefId: string,
  channel: "webhook" | "slack" | "telegram" | "feishu" | "ntfy",
) {
  const actor = await requireSessionActor();
  await assertBriefAccess(defaultStore, { actorId: actor.id, briefId });
  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    redirect("/inbox?error=Brief%20not%20found.");
  }

  try {
    const result =
      channel === "webhook"
        ? await deliverStoredBrief(defaultStore, briefId)
        : await deliverStoredBriefToChannel(defaultStore, briefId, channel);

    if (result.status !== "success") {
      throw new Error(result.error);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown delivery failure.";

    revalidatePath(`/inbox/${briefId}`);
    revalidatePath("/settings");
    redirect(`/inbox/${briefId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/inbox/${briefId}`);
  revalidatePath("/settings");
  redirect(`/inbox/${briefId}?delivered=${channel}`);
}

export async function sendBriefToWebhook(formData: FormData) {
  const briefId = getString(formData, "briefId");
  const settings = await getWebhookSettings(defaultStore);

  if (!settings.endpoint) {
    redirect(`/inbox/${briefId}?error=Configure%20a%20webhook%20endpoint%20first.`);
  }

  await sendBriefToChannel(briefId, "webhook");
}

export async function sendBriefToSlack(formData: FormData) {
  const briefId = getString(formData, "briefId");
  const settings = await getSlackSettings(defaultStore);

  if (!settings.endpoint) {
    redirect(`/inbox/${briefId}?error=Configure%20a%20Slack%20webhook%20endpoint%20first.`);
  }

  await sendBriefToChannel(briefId, "slack");
}

export async function sendBriefToTelegram(formData: FormData) {
  const briefId = getString(formData, "briefId");
  const settings = await getTelegramSettings(defaultStore);

  if (!settings.botToken || !settings.chatId) {
    redirect(`/inbox/${briefId}?error=Configure%20Telegram%20delivery%20first.`);
  }

  await sendBriefToChannel(briefId, "telegram");
}

export async function sendBriefToFeishu(formData: FormData) {
  const briefId = getString(formData, "briefId");
  const settings = await getFeishuSettings(defaultStore);

  if (!settings.endpoint) {
    redirect(`/inbox/${briefId}?error=Configure%20a%20Feishu%20webhook%20endpoint%20first.`);
  }

  await sendBriefToChannel(briefId, "feishu");
}

export async function sendBriefToNtfy(formData: FormData) {
  const briefId = getString(formData, "briefId");

  await sendBriefToChannel(briefId, "ntfy");
}
