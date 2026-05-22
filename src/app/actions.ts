"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { renderBriefHtmlDigest } from "@/lib/brief-render";
import { deliverBriefDigest } from "@/lib/delivery";
import {
  createDeliveryLog,
  createSourceRecord,
  createSpaceRecord,
  createTaskRecord,
  defaultStore,
  deleteBrief as deleteBriefRecord,
  deleteSource as deleteSourceRecord,
  deleteSpace as deleteSpaceRecord,
  deleteTask as deleteTaskRecord,
  finishDeliveryLog,
  getBriefById,
  getWebhookSettings,
  getTaskById,
  hasTaskRecord,
  listItemsByBriefId,
  markBriefRead,
  markBriefUnread,
  saveWebhookSettings,
  setSourceSchedule,
} from "@/lib/store";
import { syncAllSources, syncSourceById } from "@/lib/source-ingestion";
import { refreshTaskIntelligence } from "@/lib/task-intelligence";
import {
  createSourceSchema,
  createSpaceSchema,
  createTaskSchema,
  updateSourceScheduleSchema,
  webhookEndpointSchema,
} from "@/lib/validation";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function createSpace(formData: FormData) {
  const parsed = createSpaceSchema.safeParse({
    name: getString(formData, "name"),
    description: getString(formData, "description"),
  });

  if (!parsed.success) {
    redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid space input.")}`);
  }

  await createSpaceRecord(parsed.data);

  revalidatePath("/");
  redirect("/?created=space");
}

export async function createTask(formData: FormData) {
  const parsed = createTaskSchema.safeParse({
    spaceId: getString(formData, "spaceId"),
    title: getString(formData, "title"),
    taskType: getString(formData, "taskType"),
    userPrompt: getString(formData, "userPrompt"),
  });

  if (!parsed.success) {
    redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid task input.")}`);
  }

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
  await refreshTaskIntelligence(defaultStore, taskId);

  const task = await getTaskById(defaultStore, taskId);

  if (!task) {
    throw new Error(`Task ${taskId} not found.`);
  }

  revalidatePath(`/spaces/${task.spaceId}/tasks/${taskId}`);

  return { success: true };
}

export async function createSource(formData: FormData) {
  const parsed = createSourceSchema.safeParse({
    taskId: getString(formData, "taskId"),
    sourceType: getString(formData, "sourceType"),
    title: getString(formData, "title"),
    url: getString(formData, "url"),
  });

  if (!parsed.success) {
    redirect(`/sources?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid source input.")}`);
  }

  const taskExists = await hasTaskRecord(defaultStore, parsed.data.taskId);

  if (!taskExists) {
    redirect("/sources?error=Select%20a%20valid%20task.");
  }

  let destination = "/sources?created=source";

  try {
    await createSourceRecord(defaultStore, parsed.data);
  } catch {
    destination = "/sources?error=Unable%20to%20create%20source.";
  }

  revalidatePath("/sources");
  redirect(destination);
}

export async function runSourceSync(formData: FormData) {
  const sourceId = getString(formData, "sourceId");
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
  const parsed = updateSourceScheduleSchema.safeParse({
    sourceId: getString(formData, "sourceId"),
    syncIntervalMinutes: getString(formData, "syncIntervalMinutes"),
  });

  if (!parsed.success) {
    redirect(
      `/sources?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid schedule input.")}`,
    );
  }

  await setSourceSchedule(
    defaultStore,
    parsed.data.sourceId,
    parsed.data.syncIntervalMinutes,
  );
  revalidatePath("/sources");
  redirect("/sources?updated=schedule");
}

export async function toggleBriefRead(formData: FormData) {
  const briefId = getString(formData, "briefId");
  const isRead = getString(formData, "isRead");

  if (isRead === "1") {
    await markBriefUnread(defaultStore, briefId);
  } else {
    await markBriefRead(defaultStore, briefId);
  }

  revalidatePath("/inbox");
}

export async function deleteBrief(formData: FormData) {
  const briefId = getString(formData, "briefId");
  await deleteBriefRecord(defaultStore, briefId);

  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function deleteSource(formData: FormData) {
  const sourceId = getString(formData, "sourceId");
  await deleteSourceRecord(defaultStore, sourceId);

  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/sources");
}

export async function deleteTask(formData: FormData) {
  const taskId = getString(formData, "taskId");
  await deleteTaskRecord(defaultStore, taskId);

  revalidatePath("/");
  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/");
}

export async function deleteSpace(formData: FormData) {
  const spaceId = getString(formData, "spaceId");
  await deleteSpaceRecord(defaultStore, spaceId);

  revalidatePath("/");
  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/");
}

export async function runSyncAll() {
  const result = await syncAllSources(defaultStore);

  revalidatePath("/sources");
  revalidatePath("/inbox");

  if (result.failed > 0) {
    redirect(`/sources?error=Synced%20${result.synced}%20sources,%20but%20${result.failed}%20failed.`);
  }

  redirect(`/sources?synced=all`);
}

export async function saveWebhookEndpoint(formData: FormData) {
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

export async function sendBriefToWebhook(formData: FormData) {
  const briefId = getString(formData, "briefId");
  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    redirect("/inbox?error=Brief%20not%20found.");
  }

  const settings = await getWebhookSettings(defaultStore);

  if (!settings.endpoint) {
    redirect(`/inbox/${briefId}?error=Configure%20a%20webhook%20endpoint%20first.`);
  }

  const linkedItems = await listItemsByBriefId(defaultStore, briefId);
  const html = renderBriefHtmlDigest({ brief, linkedItems });
  const logId = await createDeliveryLog(defaultStore, {
    briefId,
    endpoint: settings.endpoint,
    payloadType: "html",
  });

  try {
    const responseStatus = await deliverBriefDigest({
      endpoint: settings.endpoint,
      payload: {
        briefId,
        format: "html",
        title: brief.title,
        html,
      },
    });

    await finishDeliveryLog(defaultStore, {
      logId,
      status: "success",
      responseStatus,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown delivery failure.";

    await finishDeliveryLog(defaultStore, {
      logId,
      status: "error",
      error: message,
    });

    revalidatePath(`/inbox/${briefId}`);
    revalidatePath("/settings");
    redirect(`/inbox/${briefId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/inbox/${briefId}`);
  revalidatePath("/settings");
  redirect(`/inbox/${briefId}?delivered=webhook`);
}
