"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createSourceRecord,
  createSpaceRecord,
  createTaskRecord,
  defaultStore,
  deleteBrief as deleteBriefRecord,
  deleteSource as deleteSourceRecord,
  deleteSpace as deleteSpaceRecord,
  deleteTask as deleteTaskRecord,
  hasTaskRecord,
  markBriefRead,
  markBriefUnread,
} from "@/lib/store";
import { syncAllSources, syncSourceById } from "@/lib/source-ingestion";
import { createSourceSchema, createSpaceSchema, createTaskSchema } from "@/lib/validation";

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

  createSpaceRecord(parsed.data);

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

  createTaskRecord(parsed.data);

  revalidatePath("/");
  redirect("/?created=task");
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

  const taskExists = hasTaskRecord(defaultStore, parsed.data.taskId);

  if (!taskExists) {
    redirect("/sources?error=Select%20a%20valid%20task.");
  }

  let destination = "/sources?created=source";

  try {
    createSourceRecord(defaultStore, parsed.data);
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

export async function toggleBriefRead(formData: FormData) {
  const briefId = getString(formData, "briefId");
  const isRead = getString(formData, "isRead");

  if (isRead === "1") {
    markBriefUnread(defaultStore, briefId);
  } else {
    markBriefRead(defaultStore, briefId);
  }

  revalidatePath("/inbox");
}

export async function deleteBrief(formData: FormData) {
  const briefId = getString(formData, "briefId");
  deleteBriefRecord(defaultStore, briefId);

  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function deleteSource(formData: FormData) {
  const sourceId = getString(formData, "sourceId");
  deleteSourceRecord(defaultStore, sourceId);

  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/sources");
}

export async function deleteTask(formData: FormData) {
  const taskId = getString(formData, "taskId");
  deleteTaskRecord(defaultStore, taskId);

  revalidatePath("/");
  revalidatePath("/sources");
  revalidatePath("/inbox");
  redirect("/");
}

export async function deleteSpace(formData: FormData) {
  const spaceId = getString(formData, "spaceId");
  deleteSpaceRecord(defaultStore, spaceId);

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

