"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createItemRecord,
  createSourceRecord,
  createSpaceRecord,
  createTaskRecord,
  defaultStore,
  getSourceById,
  hasTaskRecord,
  markSourceSyncResult,
} from "@/lib/store";
import { parseFeedItems } from "@/lib/rss";
import { createSourceSchema, createSpaceSchema, createTaskSchema } from "@/lib/validation";

const SOURCE_SYNC_TIMEOUT_MS = 10_000;

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function getSyncErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "Feed request timed out.";
    }

    return error.message;
  }

  return "Unknown sync error.";
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
  const source = getSourceById(defaultStore, sourceId);

  if (!source) {
    redirect("/sources?error=Source%20not%20found.");
  }

  let syncError: string | null = null;

  try {
    const response = await fetch(source.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Feed request failed with ${response.status}`);
    }

    const xml = await response.text();
    const items = parseFeedItems(xml);

    if (items.length === 0) {
      throw new Error("Feed returned no supported items.");
    }

    for (const item of items) {
      createItemRecord(defaultStore, {
        sourceId: source.id,
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        summary: item.summary,
        publishedAt: item.publishedAt,
      });
    }

    markSourceSyncResult(defaultStore, {
      sourceId: source.id,
      status: "success",
    });
  } catch (error) {
    syncError = getSyncErrorMessage(error);

    markSourceSyncResult(defaultStore, {
      sourceId: source.id,
      status: "error",
      error: syncError,
    });
  }

  revalidatePath("/sources");

  if (syncError) {
    redirect(`/sources?error=${encodeURIComponent(syncError)}`);
  }

  redirect("/sources?synced=source");
}
