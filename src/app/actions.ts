"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  assertBriefAccess,
  assertSourceAccess,
  assertSpaceAccess,
  assertTaskAccess,
  clearSessionActorCookie,
  createInvitedSessionActor,
  createOperatorSessionActor,
  getSessionUser,
  hasConfiguredOperatorLogin,
  requireOperatorSessionActor,
  requireSessionActor,
  setSessionActorCookie,
} from "@/lib/auth";
import { deliverStoredBrief, deliverStoredBriefToChannel } from "@/lib/delivery";
import {
  addSpaceMember,
  acceptSpaceInvite,
  createSourceRecord,
  createSpaceInvite,
  createSpaceRecord,
  createTaskRecord,
  defaultStore,
  deleteBrief as deleteBriefRecord,
  deleteSource as deleteSourceRecord,
  deleteSpace as deleteSpaceRecord,
  deleteTask as deleteTaskRecord,
  getBriefById,
  getFeishuSettings,
  getSlackSettings,
  getTelegramSettings,
  getWebhookSettings,
  getTaskById,
  hasTaskRecord,
  listSources,
  listSpaceInvites,
  markBriefRead,
  markBriefUnread,
  removeSpaceMember,
  revokeSpaceInvite,
  saveFeishuSettings,
  saveTelegramSourceSettings,
  saveTelegramSettings,
  saveWebhookSettings,
  saveSlackSettings,
  setSourceSchedule,
} from "@/lib/store";
import { syncSourceById } from "@/lib/source-ingestion";
import { getSourcePresetById } from "@/lib/source-presets";
import { refreshTaskIntelligence } from "@/lib/task-intelligence";
import {
  createSourceSchema,
  createSpaceSchema,
  feishuWebhookEndpointSchema,
  createTaskSchema,
  slackWebhookEndpointSchema,
  spaceMemberSchema,
  telegramSourceSettingsSchema,
  telegramSettingsSchema,
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
    redirect(`/login?error=Operator%20login%20is%20not%20configured.`);
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

export async function createSpace(formData: FormData) {
  const actor = await requireSessionActor();
  const parsed = createSpaceSchema.safeParse({
    name: getString(formData, "name"),
    description: getString(formData, "description"),
  });

  if (!parsed.success) {
    redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid space input.")}`);
  }

  await createSpaceRecord({
    ...parsed.data,
    ownerId: actor.id,
  });

  revalidatePath("/");
  redirect("/?created=space");
}

export async function createTask(formData: FormData) {
  const actor = await requireSessionActor();
  const parsed = createTaskSchema.safeParse({
    spaceId: getString(formData, "spaceId"),
    title: getString(formData, "title"),
    taskType: getString(formData, "taskType"),
    userPrompt: getString(formData, "userPrompt"),
  });

  if (!parsed.success) {
    redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid task input.")}`);
  }

  await assertSpaceAccess(defaultStore, {
    actorId: actor.id,
    spaceId: parsed.data.spaceId,
    minimumRole: "editor",
  });

  const taskId = await createTaskRecord(parsed.data);

  try {
    await refreshTaskIntelligence(defaultStore, taskId);
  } catch (error) {
    console.error(`Failed to initialize task intelligence for ${taskId}:`, error);
  }

  revalidatePath("/");
  redirect("/?created=task");
}

export async function refreshStoredTaskIntelligence(taskId: string) {
  const actor = await requireSessionActor();
  await assertTaskAccess(defaultStore, {
    actorId: actor.id,
    taskId,
    minimumRole: "editor",
  });

  await refreshTaskIntelligence(defaultStore, taskId);

  const task = await getTaskById(defaultStore, taskId);

  if (!task) {
    throw new Error(`Task ${taskId} not found.`);
  }

  revalidatePath(`/spaces/${task.spaceId}/tasks/${taskId}`);

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
    redirect(`/sources?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid source input.")}`);
  }

  const taskExists = await hasTaskRecord(defaultStore, parsed.data.taskId);

  if (!taskExists) {
    redirect("/sources?error=Select%20a%20valid%20task.");
  }

  await assertTaskAccess(defaultStore, {
    actorId: actor.id,
    taskId: parsed.data.taskId,
    minimumRole: "editor",
  });

  let destination = "/sources?created=source";

  try {
    await createSourceRecord(defaultStore, parsed.data);
  } catch {
    destination = "/sources?error=Unable%20to%20create%20source.";
  }

  revalidatePath("/sources");
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

  const taskExists = await hasTaskRecord(defaultStore, taskId);

  if (!taskExists) {
    redirect("/sources?error=Select%20a%20valid%20task.");
  }

  await assertTaskAccess(defaultStore, {
    actorId: actor.id,
    taskId,
    minimumRole: "editor",
  });

  let destination = "/sources?created=source";

  try {
    await createSourceRecord(defaultStore, {
      taskId,
      sourceType: preset.sourceType,
      title: preset.title,
      url: preset.url,
    });
  } catch {
    destination = "/sources?error=Unable%20to%20add%20built-in%20source.";
  }

  revalidatePath("/sources");
  redirect(destination);
}

export async function runSourceSync(formData: FormData) {
  const actor = await requireSessionActor();
  const sourceId = getString(formData, "sourceId");
  await assertSourceAccess(defaultStore, {
    actorId: actor.id,
    sourceId,
    minimumRole: "editor",
  });
  const result = await syncSourceById(defaultStore, sourceId);

  if (!result.source) {
    redirect("/sources?error=Source%20not%20found.");
  }

  revalidatePath("/sources");
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
    minimumRole: "editor",
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

  await assertBriefAccess(defaultStore, {
    actorId: actor.id,
    briefId,
    minimumRole: "editor",
  });

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
  await assertBriefAccess(defaultStore, {
    actorId: actor.id,
    briefId,
    minimumRole: "editor",
  });
  await deleteBriefRecord(defaultStore, briefId);

  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function deleteSource(formData: FormData) {
  const actor = await requireSessionActor();
  const sourceId = getString(formData, "sourceId");
  await assertSourceAccess(defaultStore, {
    actorId: actor.id,
    sourceId,
    minimumRole: "editor",
  });
  await deleteSourceRecord(defaultStore, sourceId);

  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/sources");
}

export async function deleteTask(formData: FormData) {
  const actor = await requireSessionActor();
  const taskId = getString(formData, "taskId");
  await assertTaskAccess(defaultStore, {
    actorId: actor.id,
    taskId,
    minimumRole: "editor",
  });
  await deleteTaskRecord(defaultStore, taskId);

  revalidatePath("/");
  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/");
}

export async function deleteSpace(formData: FormData) {
  const actor = await requireSessionActor();
  const spaceId = getString(formData, "spaceId");
  await assertSpaceAccess(defaultStore, {
    actorId: actor.id,
    spaceId,
    minimumRole: "owner",
  });
  await deleteSpaceRecord(defaultStore, spaceId);

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
        minimumRole: "editor",
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

  redirect(`/sources?synced=all`);
}

export async function saveWebhookEndpoint(formData: FormData) {
  await requireOperatorSessionActor();
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
  await requireOperatorSessionActor();
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
  await requireOperatorSessionActor();
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
  await requireOperatorSessionActor();
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
  await requireOperatorSessionActor();
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

export async function upsertSpaceMemberAction(formData: FormData) {
  const actor = await requireSessionActor();
  const parsed = spaceMemberSchema.safeParse({
    spaceId: getString(formData, "spaceId"),
    userId: getString(formData, "userId"),
    role: getString(formData, "role"),
  });

  if (!parsed.success) {
    redirect(
      `/spaces/${encodeURIComponent(getString(formData, "spaceId"))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid member input.")}`,
    );
  }

  await assertSpaceAccess(defaultStore, {
    actorId: actor.id,
    spaceId: parsed.data.spaceId,
    minimumRole: "owner",
  });

  if (parsed.data.userId === actor.id) {
    redirect(`/spaces/${parsed.data.spaceId}?error=Cannot%20change%20the%20owner%20membership%20record.`);
  }

  await addSpaceMember(defaultStore, parsed.data);
  revalidatePath(`/spaces/${parsed.data.spaceId}`);
  redirect(`/spaces/${parsed.data.spaceId}?updated=member`);
}

export async function removeSpaceMemberAction(formData: FormData) {
  const actor = await requireSessionActor();
  const spaceId = getString(formData, "spaceId");
  const userId = getString(formData, "userId");

  await assertSpaceAccess(defaultStore, {
    actorId: actor.id,
    spaceId,
    minimumRole: "owner",
  });

  if (userId === actor.id) {
    redirect(`/spaces/${spaceId}?error=Cannot%20remove%20the%20space%20owner.`);
  }

  await removeSpaceMember(defaultStore, { spaceId, userId });
  revalidatePath(`/spaces/${spaceId}`);
  redirect(`/spaces/${spaceId}?updated=member`);
}

export async function createSpaceInviteAction(formData: FormData) {
  const actor = await requireSessionActor();
  const spaceId = getString(formData, "spaceId");
  const role = getString(formData, "role");

  if (role !== "viewer" && role !== "editor") {
    redirect(`/spaces/${spaceId}?error=Invalid%20invite%20role.`);
  }

  await assertSpaceAccess(defaultStore, {
    actorId: actor.id,
    spaceId,
    minimumRole: "owner",
  });

  await createSpaceInvite(defaultStore, {
    spaceId,
    role,
    createdBy: actor.id,
  });

  revalidatePath(`/spaces/${spaceId}`);
  redirect(`/spaces/${spaceId}?updated=invite`);
}

export async function revokeSpaceInviteAction(formData: FormData) {
  const actor = await requireSessionActor();
  const inviteId = getString(formData, "inviteId");
  const spaceId = getString(formData, "spaceId");

  await assertSpaceAccess(defaultStore, {
    actorId: actor.id,
    spaceId,
    minimumRole: "owner",
  });

  const invites = await listSpaceInvites(defaultStore, spaceId);
  const invite = invites.find((candidate) => candidate.id === inviteId);

  if (!invite) {
    redirect(`/spaces/${spaceId}?error=Invite%20not%20found.`);
  }

  await revokeSpaceInvite(defaultStore, inviteId);
  revalidatePath(`/spaces/${spaceId}`);
  redirect(`/spaces/${spaceId}?updated=invite`);
}

export async function acceptSpaceInviteAction(formData: FormData) {
  const token = getString(formData, "token");
  const inviteEmail = getString(formData, "email");
  let actor = await getSessionUser().catch(() => null);

  if (!actor) {
    try {
      actor = await createInvitedSessionActor(inviteEmail);
      await setSessionActorCookie(actor);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invite identity is invalid.";
      redirect(`/invite/${token}?error=${encodeURIComponent(message)}`);
    }
  }

  const invite = await acceptSpaceInvite(defaultStore, {
    token,
    actorId: actor.id,
  });

  if (!invite) {
    redirect(`/invite/${token}?error=Invite%20is%20invalid%20or%20already%20used.`);
  }

  revalidatePath(`/spaces/${invite.spaceId}`);
  redirect(`/spaces/${invite.spaceId}?updated=invite`);
}

export async function sendBriefToWebhook(formData: FormData) {
  const actor = await requireSessionActor();
  const briefId = getString(formData, "briefId");
  await assertBriefAccess(defaultStore, {
    actorId: actor.id,
    briefId,
    minimumRole: "viewer",
  });
  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    redirect("/inbox?error=Brief%20not%20found.");
  }

  const settings = await getWebhookSettings(defaultStore);

  if (!settings.endpoint) {
    redirect(`/inbox/${briefId}?error=Configure%20a%20webhook%20endpoint%20first.`);
  }

  try {
    const result = await deliverStoredBrief(defaultStore, briefId);

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
  redirect(`/inbox/${briefId}?delivered=webhook`);
}

export async function sendBriefToSlack(formData: FormData) {
  const actor = await requireSessionActor();
  const briefId = getString(formData, "briefId");
  await assertBriefAccess(defaultStore, {
    actorId: actor.id,
    briefId,
    minimumRole: "viewer",
  });
  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    redirect("/inbox?error=Brief%20not%20found.");
  }

  const settings = await getSlackSettings(defaultStore);

  if (!settings.endpoint) {
    redirect(`/inbox/${briefId}?error=Configure%20a%20Slack%20webhook%20endpoint%20first.`);
  }

  try {
    const result = await deliverStoredBriefToChannel(defaultStore, briefId, "slack");

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
  redirect(`/inbox/${briefId}?delivered=slack`);
}

export async function sendBriefToTelegram(formData: FormData) {
  const actor = await requireSessionActor();
  const briefId = getString(formData, "briefId");
  await assertBriefAccess(defaultStore, {
    actorId: actor.id,
    briefId,
    minimumRole: "viewer",
  });

  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    redirect("/inbox?error=Brief%20not%20found.");
  }

  const settings = await getTelegramSettings(defaultStore);

  if (!settings.botToken || !settings.chatId) {
    redirect(`/inbox/${briefId}?error=Configure%20Telegram%20delivery%20first.`);
  }

  try {
    const result = await deliverStoredBriefToChannel(defaultStore, briefId, "telegram");

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
  redirect(`/inbox/${briefId}?delivered=telegram`);
}

export async function sendBriefToFeishu(formData: FormData) {
  const actor = await requireSessionActor();
  const briefId = getString(formData, "briefId");
  await assertBriefAccess(defaultStore, {
    actorId: actor.id,
    briefId,
    minimumRole: "viewer",
  });

  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    redirect("/inbox?error=Brief%20not%20found.");
  }

  const settings = await getFeishuSettings(defaultStore);

  if (!settings.endpoint) {
    redirect(`/inbox/${briefId}?error=Configure%20a%20Feishu%20webhook%20endpoint%20first.`);
  }

  try {
    const result = await deliverStoredBriefToChannel(defaultStore, briefId, "feishu");

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
  redirect(`/inbox/${briefId}?delivered=feishu`);
}
