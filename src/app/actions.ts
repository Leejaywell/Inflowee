"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createSpaceRecord,
  createTaskRecord,
  defaultStore,
  getSourceById,
  hasTaskRecord,
  markSourceSyncResult,
} from "@/lib/store";
import { buildBriefsFromItems } from "@/lib/briefs";
import { parseFeedItems } from "@/lib/rss";
import { fetchSourceFeed, getBlockedSourceUrlError } from "@/lib/source-sync";
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

function storeSourceItemsAndCreateBriefs(
  store: typeof defaultStore,
  source: {
    id: string;
    taskId: string;
  },
  items: Array<{
    title: string;
    canonicalUrl: string;
    summary: string | null;
    publishedAt: string | null;
  }>,
) {
  const insertedItems = items.flatMap((item) => {
    const storedItem = createItemRecordResult(store, {
      sourceId: source.id,
      title: item.title,
      canonicalUrl: item.canonicalUrl,
      summary: item.summary,
      publishedAt: item.publishedAt,
    });

    return storedItem ? [storedItem] : [];
  });

  const briefs = buildBriefsFromItems(source.taskId, insertedItems);

  for (const brief of briefs) {
    createBriefRecord(store, brief);
  }

  return {
    insertedItemCount: insertedItems.length,
    createdBriefCount: briefs.length,
  };
}

export async function runSourceSync(formData: FormData) {
  const sourceId = getString(formData, "sourceId");
  const source = getSourceById(defaultStore, sourceId);

  if (!source) {
    redirect("/sources?error=Source%20not%20found.");
  }

  const blockedSourceError = getBlockedSourceUrlError(source.url);

  if (blockedSourceError) {
    markSourceSyncResult(defaultStore, {
      sourceId: source.id,
      status: "error",
      error: blockedSourceError,
    });

    revalidatePath("/sources");
    redirect(`/sources?error=${encodeURIComponent(blockedSourceError)}`);
  }

  let syncError: string | null = null;

  try {
    const xml = await fetchSourceFeed(source.url, {
      signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
    });
    const items = parseFeedItems(xml);

    if (items.length === 0) {
      throw new Error("Feed returned no supported items.");
    }

    storeSourceItemsAndCreateBriefs(defaultStore, source, items);

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
