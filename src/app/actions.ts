"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  assertBriefAccess,
  assertSourceAccess,
  assertTopicAccess,
  clearSessionActorCookie,
  createOperatorSessionActor,
  hasConfiguredOperatorLogin,
  requireSessionActor,
  setSessionActorCookie,
} from "@/lib/auth";
import {
  deliverStoredBrief,
  deliverStoredBriefToChannel,
  deliverTextToChannel,
  type DeliveryChannel,
} from "@/lib/delivery";
import {
  createSourceRecord,
  createTopicRecord,
  defaultStore,
  deleteBrief as deleteBriefRecord,
  deleteSource as deleteSourceRecord,
  deleteTopic as deleteTopicRecord,
  getBriefById,
  getFeishuSettings,
  getSlackSettings,
  getTelegramSettings,
  getWebhookSettings,
  hasTopicRecord,
  listSources,
  markBriefRead,
  markBriefUnread,
  saveHtmlPushConfig,
  saveTopicHtmlPushConfig,
  saveBarkSettings,
  saveDefaultDeliveryChannels,
  saveDeliveryTemplate,
  saveDingTalkSettings,
  saveEmailSettings,
  saveFeishuSettings,
  saveNtfySettings,
  saveSlackSettings,
  saveTelegramSettings,
  saveTelegramSourceSettings,
  saveWeComSettings,
  saveWebhookSettings,
  setSourceSchedule,
  updateTopicDeliveryChannels,
  updateTopicScheduleProfile,
} from "@/lib/store";
import { encryptSecret } from "@/lib/secret-box";
import { DELIVERY_ADAPTERS } from "@/lib/delivery";
import { previewTopicHtmlPublication } from "@/lib/html-push";
import { syncSourceById } from "@/lib/source-ingestion";
import { getSourcePresetById } from "@/lib/source-presets";
import { generateTopicReport } from "@/lib/reports";
import {
  buildSchedulePreset,
  validateScheduleProfile,
  type TopicSchedulePreset,
} from "@/lib/topic-schedule";
import { refreshTopicIntelligence } from "@/lib/topic-intelligence";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n";
import {
  APPEARANCE_COOKIE_NAME,
  THEME_COOKIE_NAME,
  normalizeAppearance,
  normalizeTheme,
} from "@/lib/theme";
import {
  createSourceSchema,
  createTopicSchema,
  deliveryEndpointSchema,
  feishuWebhookEndpointSchema,
  ntfyEndpointSchema,
  saveHtmlPushConfigSchema,
  saveTopicHtmlPushConfigSchema,
  smtpEndpointSchema,
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

export async function createTopic(formData: FormData) {
  const actor = await requireSessionActor();
  const userPrompt = getString(formData, "userPrompt");
  const title = getString(formData, "title") || userPrompt.slice(0, 28);
  const parsed = createTopicSchema.safeParse({
    title,
    topicType: getString(formData, "topicType") || "TOPIC",
    userPrompt,
  });

  if (!parsed.success) {
    redirect(
      `/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Topic input.")}`,
    );
  }

  const topicId = await createTopicRecord(defaultStore, {
    ...parsed.data,
    ownerId: actor.id,
  });

  try {
    await refreshTopicIntelligence(defaultStore, topicId);
  } catch (error) {
    console.error(`Failed to initialize topic intelligence for ${topicId}:`, error);
  }

  revalidatePath("/");
  redirect(`/topics/${topicId}`);
}

export async function refreshStoredTopicIntelligence(topicId: string) {
  const actor = await requireSessionActor();
  await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });

  await refreshTopicIntelligence(defaultStore, topicId);

  revalidatePath(`/topics/${topicId}`);

  return { success: true };
}

export async function createSource(formData: FormData) {
  const actor = await requireSessionActor();
  const sourceType = getString(formData, "sourceType");
  const parsed = createSourceSchema.safeParse({
    topicId: getString(formData, "topicId"),
    sourceType,
    title: getString(formData, "title"),
    url: normalizeSourceUrl(sourceType, getString(formData, "url")),
  });

  if (!parsed.success) {
    redirect(
      `/sources?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid source input.")}`,
    );
  }

  if (!(await hasTopicRecord(defaultStore, parsed.data.topicId))) {
    redirect("/sources?error=Select%20a%20valid%20Topic.");
  }

  await assertTopicAccess(defaultStore, {
    actorId: actor.id,
    topicId: parsed.data.topicId,
  });

  let destination = "/sources?created=source";

  try {
    await createSourceRecord(defaultStore, parsed.data);
  } catch {
    destination = "/sources?error=Unable%20to%20create%20source.";
  }

  revalidatePath("/sources");
  revalidatePath(`/topics/${parsed.data.topicId}`);
  redirect(destination);
}

export async function createPresetSource(formData: FormData) {
  const actor = await requireSessionActor();
  const topicId = getString(formData, "topicId");
  const presetId = getString(formData, "presetId");
  const preset = getSourcePresetById(presetId);

  if (!preset) {
    redirect("/sources?error=Unknown%20built-in%20source.");
  }

  if (!(await hasTopicRecord(defaultStore, topicId))) {
    redirect("/sources?error=Select%20a%20valid%20Topic.");
  }

  await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });

  let destination = "/sources?created=source";

  try {
    await createSourceRecord(defaultStore, {
      topicId,
      sourceType: preset.sourceType,
      title: preset.title,
      url: preset.url,
      configJson: preset.configJson ?? null,
    });
  } catch {
    destination = "/sources?error=Unable%20to%20add%20built-in%20source.";
  }

  revalidatePath("/sources");
  revalidatePath(`/topics/${topicId}`);
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
  revalidatePath(`/topics/${result.source.topicId}`);
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

export async function deleteTopic(formData: FormData) {
  const actor = await requireSessionActor();
  const topicId = getString(formData, "topicId");
  await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });
  await deleteTopicRecord(defaultStore, topicId);

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
  const topicId = getString(formData, "topicId");
  const mode = getString(formData, "mode");

  if (mode !== "current" && mode !== "daily" && mode !== "incremental") {
    redirect(`/topics/${topicId}?error=Invalid%20report%20mode.`);
  }

  await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });
  await generateTopicReport(defaultStore, topicId, { mode });

  revalidatePath(`/topics/${topicId}`);
  redirect(`/topics/${topicId}`);
}

export async function saveTopicSchedulePresetAction(formData: FormData) {
  const actor = await requireSessionActor();
  const topicId = getString(formData, "topicId");
  const preset = getString(formData, "preset") as TopicSchedulePreset;
  const timezone = getString(formData, "timezone") || "Asia/Shanghai";
  const allowedPresets: TopicSchedulePreset[] = [
    "always_on",
    "morning_evening",
    "office_hours",
    "nightly_summary",
  ];

  if (!allowedPresets.includes(preset)) {
    redirect(`/topics/${topicId}?error=Invalid%20schedule%20preset.`);
  }

  await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });

  const profile = buildSchedulePreset(preset, timezone);
  const errors = validateScheduleProfile(profile);

  if (errors.length > 0) {
    redirect(`/topics/${topicId}?error=${encodeURIComponent(errors[0])}`);
  }

  await updateTopicScheduleProfile(defaultStore, topicId, profile);

  revalidatePath(`/topics/${topicId}`);
  redirect(`/topics/${topicId}`);
}

export async function saveTopicCustomScheduleAction(formData: FormData) {
  const actor = await requireSessionActor();
  const topicId = getString(formData, "topicId");
  const timezone = getString(formData, "timezone") || "Asia/Shanghai";
  const startMinutes = Number(getString(formData, "startMinutes"));
  const endMinutes = Number(getString(formData, "endMinutes"));
  const days = formData
    .getAll("days")
    .map((value) => Number(String(value)))
    .filter((value) => Number.isInteger(value));
  const reportMode = getString(formData, "reportMode");
  const normalizedReportMode: "current" | "daily" | "incremental" =
    reportMode === "daily" || reportMode === "incremental"
      ? reportMode
      : "current";
  const profile = {
    preset: "custom" as const,
    timezone,
    windows: [
      {
        id: "custom-window",
        days,
        startMinutes,
        endMinutes,
        collect: getString(formData, "collect") === "1",
        generateBriefs: getString(formData, "generateBriefs") === "1",
        generateReports: getString(formData, "generateReports") === "1",
        push: getString(formData, "push") === "1",
        reportMode: normalizedReportMode,
        filterMode: "keyword" as const,
        maxPushItems: 5,
      },
    ],
  };
  const errors = validateScheduleProfile(profile);

  if (errors.length > 0) {
    redirect(`/topics/${topicId}?error=${encodeURIComponent(errors[0])}`);
  }

  await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });
  await updateTopicScheduleProfile(defaultStore, topicId, profile);

  revalidatePath(`/topics/${topicId}`);
  redirect(`/topics/${topicId}`);
}

export async function saveTopicDeliveryChannelsAction(formData: FormData) {
  const actor = await requireSessionActor();
  const topicId = getString(formData, "topicId");
  const allowedChannels = new Set<string>(
    DELIVERY_ADAPTERS.map((adapter) => adapter.type),
  );
  const channels = formData
    .getAll("channels")
    .map((value) => String(value))
    .filter((value) => allowedChannels.has(value));

  await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });
  await updateTopicDeliveryChannels(defaultStore, topicId, channels);

  revalidatePath(`/topics/${topicId}`);
  redirect(`/topics/${topicId}`);
}

export async function saveTopicHtmlPushConfigAction(formData: FormData) {
  const actor = await requireSessionActor();
  const parsed = saveTopicHtmlPushConfigSchema.safeParse({
    topicId: getString(formData, "topicId"),
    useGlobal: formData.get("useGlobal") === "on",
    enabled: formData.get("enabled") === "on",
    stylePreset: getString(formData, "stylePreset"),
    modulePreset: getString(formData, "modulePreset"),
    enabledModules: formData.getAll("enabledModules").map(String),
    customPrompt: getString(formData, "customPrompt") || undefined,
  });

  if (!parsed.success) {
    redirect(
      `/topics/${getString(formData, "topicId")}?section=delivery&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid topic HTML push settings.")}`,
    );
  }

  await assertTopicAccess(defaultStore, {
    actorId: actor.id,
    topicId: parsed.data.topicId,
  });
  await saveTopicHtmlPushConfig(defaultStore, {
    topicId: parsed.data.topicId,
    useGlobal: parsed.data.useGlobal,
    enabled: parsed.data.enabled,
    stylePreset: parsed.data.stylePreset,
    modulePreset: parsed.data.modulePreset,
    enabledModules: parsed.data.enabledModules,
    customPrompt: parsed.data.customPrompt ?? null,
  });

  revalidatePath(`/topics/${parsed.data.topicId}`);
  redirect(`/topics/${parsed.data.topicId}?section=delivery`);
}

export async function previewTopicHtmlPushAction(formData: FormData) {
  const actor = await requireSessionActor();
  const topicId = getString(formData, "topicId");

  await assertTopicAccess(defaultStore, { actorId: actor.id, topicId });

  let result: Awaited<ReturnType<typeof previewTopicHtmlPublication>>;
  try {
    result = await previewTopicHtmlPublication(defaultStore, topicId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate HTML preview.";

    redirect(`/topics/${topicId}?section=delivery&error=${encodeURIComponent(message)}`);
  }

  if (result.status === "unavailable") {
    redirect(
      `/topics/${topicId}?section=delivery&error=${encodeURIComponent(result.reason)}`,
    );
  }

  revalidatePath(`/topics/${topicId}`);
  redirect(`/topics/${topicId}?section=delivery&preview=${result.publicationId}`);
}

export async function saveDefaultDeliveryChannelsAction(formData: FormData) {
  await requireSessionActor();
  const allowedChannels = new Set<string>(
    DELIVERY_ADAPTERS.map((adapter) => adapter.type),
  );
  const channels = formData
    .getAll("channels")
    .map((value) => String(value))
    .filter((value) => allowedChannels.has(value));

  await saveDefaultDeliveryChannels(defaultStore, channels);

  revalidatePath("/settings");
  redirect("/settings?updated=default-delivery-channels");
}

export async function saveDeliveryTemplateAction(formData: FormData) {
  await requireSessionActor();
  const template = getString(formData, "template");

  if (template.length > 2_000) {
    redirect("/settings?error=Delivery%20template%20is%20too%20long.");
  }

  await saveDeliveryTemplate(defaultStore, template);

  revalidatePath("/settings");
  redirect("/settings?updated=delivery-template");
}

export async function saveHtmlPushConfigAction(formData: FormData) {
  const actor = await requireSessionActor();
  const githubToken = getString(formData, "githubToken").trim();
  const parsed = saveHtmlPushConfigSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    entitlementStatus: getString(formData, "entitlementStatus") || "available",
    stylePreset: getString(formData, "stylePreset"),
    modulePreset: getString(formData, "modulePreset"),
    enabledModules: formData.getAll("enabledModules").map(String),
    customPrompt: getString(formData, "customPrompt") || undefined,
    githubToken: githubToken || undefined,
    githubRepo: getString(formData, "githubRepo") || undefined,
    githubBranch: getString(formData, "githubBranch") || "main",
    githubBasePath: getString(formData, "githubBasePath") || "inflowee/html",
    publicBaseUrl: getString(formData, "publicBaseUrl") || undefined,
  });

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid HTML push settings.")}`,
    );
  }

  try {
    await saveHtmlPushConfig(defaultStore, {
      ownerId: actor.id,
      enabled: parsed.data.enabled,
      entitlementStatus: parsed.data.entitlementStatus,
      stylePreset: parsed.data.stylePreset,
      modulePreset: parsed.data.modulePreset,
      enabledModules: parsed.data.enabledModules,
      customPrompt: parsed.data.customPrompt ?? null,
      githubTokenEncrypted: githubToken ? encryptSecret(githubToken) : undefined,
      githubRepo: parsed.data.githubRepo ?? null,
      githubBranch: parsed.data.githubBranch,
      githubBasePath: parsed.data.githubBasePath,
      publicBaseUrl: parsed.data.publicBaseUrl || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save HTML push settings.";

    redirect(`/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/settings");
  redirect("/settings?updated=html-push");
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

async function saveGenericDeliveryEndpoint(
  formData: FormData,
  key: "dingtalk" | "wecom" | "bark" | "email",
) {
  await requireSessionActor();
  const parsed =
    key === "email"
      ? smtpEndpointSchema.safeParse(getString(formData, "endpoint"))
      : deliveryEndpointSchema.safeParse(getString(formData, "endpoint"));

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid delivery endpoint.")}`,
    );
  }

  if (key === "dingtalk") {
    await saveDingTalkSettings(defaultStore, parsed.data);
  } else if (key === "wecom") {
    await saveWeComSettings(defaultStore, parsed.data);
  } else if (key === "bark") {
    await saveBarkSettings(defaultStore, parsed.data);
  } else {
    await saveEmailSettings(defaultStore, parsed.data);
  }

  revalidatePath("/settings");
  redirect(`/settings?updated=${key}`);
}

export async function saveDingTalkEndpoint(formData: FormData) {
  await saveGenericDeliveryEndpoint(formData, "dingtalk");
}

export async function saveWeComEndpoint(formData: FormData) {
  await saveGenericDeliveryEndpoint(formData, "wecom");
}

export async function saveBarkEndpoint(formData: FormData) {
  await saveGenericDeliveryEndpoint(formData, "bark");
}

export async function saveEmailEndpoint(formData: FormData) {
  await saveGenericDeliveryEndpoint(formData, "email");
}

export async function testDeliveryChannelAction(formData: FormData) {
  await requireSessionActor();
  const channel = getString(formData, "channel") as DeliveryChannel;
  const adapter = DELIVERY_ADAPTERS.find((candidate) => candidate.type === channel);

  if (!adapter) {
    redirect("/settings?error=Unsupported%20delivery%20channel.");
  }

  try {
    const result = await deliverTextToChannel(defaultStore, channel, {
      id: `test:${Date.now()}`,
      title: "Inflowee test delivery",
      body: "This is a test message from Inflowee.",
      contentType: "message",
    });

    if (result.status !== "success") {
      throw new Error(result.error);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown delivery failure.";

    revalidatePath("/settings");
    redirect(`/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/settings");
  redirect(`/settings?updated=test-${channel}`);
}

async function sendBriefToChannel(
  briefId: string,
  channel:
    | "webhook"
    | "slack"
    | "telegram"
    | "feishu"
    | "ntfy"
    | "dingtalk"
    | "wecom"
    | "bark"
    | "email",
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
