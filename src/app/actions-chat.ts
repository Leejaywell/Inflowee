"use server";

import { revalidatePath } from "next/cache";
import {
  defaultStore,
  getOrCreateChatThread,
  createChatMessage,
  listChatMessages,
  getBriefById,
  listBriefsFiltered,
  createSourceRecord,
  updateTaskControls,
  BriefRecord,
  ItemRecord,
} from "@/lib/store";
import { generateChatResponse } from "@/lib/ai";

type ChatScope = "global" | "space" | "task" | "brief";

export async function submitChatMessage(
  scopeType: ChatScope,
  scopeId: string,
  content: string,
) {
  if (!content || !content.trim()) {
    throw new Error("Message content cannot be empty.");
  }

  const store = defaultStore;

  // 1. Get or create thread
  const thread = getOrCreateChatThread(store, scopeType, scopeId);

  // 2. Insert user message
  createChatMessage(store, {
    threadId: thread.id,
    role: "user",
    content: content.trim(),
  });

  // 3. Get entire chat history
  const messages = listChatMessages(store, thread.id);
  const formattedHistory = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 4. Gather grounding materials depending on scope
  let briefs: BriefRecord[] = [];
  let items: ItemRecord[] = [];

  interface SqlItemRow {
    id: string;
    source_id: string;
    title: string;
    canonical_url: string;
    summary: string | null;
    published_at: string | null;
    created_at: string;
  }

  const mapSqlItem = (row: SqlItemRow): ItemRecord => ({
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    canonicalUrl: row.canonical_url,
    summary: row.summary,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  });

  try {
    if (scopeType === "brief") {
      const brief = getBriefById(store, scopeId);
      if (brief) {
        briefs.push(brief);
        const rows = (store.database
          .prepare(
            `SELECT items.* FROM items
             JOIN brief_items ON brief_items.item_id = items.id
             WHERE brief_items.brief_id = ?`,
          )
          .all(scopeId) as unknown) as SqlItemRow[];
        items = rows.map(mapSqlItem);
      }
    } else if (scopeType === "task") {
      briefs = listBriefsFiltered(store, { taskId: scopeId });
      const rows = (store.database
        .prepare(
          `SELECT items.* FROM items
           JOIN sources ON items.source_id = sources.id
           WHERE sources.task_id = ?`,
        )
        .all(scopeId) as unknown) as SqlItemRow[];
      items = rows.map(mapSqlItem);
    } else if (scopeType === "space") {
      const tasks = store.database
        .prepare("SELECT id FROM tasks WHERE space_id = ?")
        .all(scopeId) as Array<{ id: string }>;
      const taskIds = tasks.map((t) => t.id);

      if (taskIds.length > 0) {
        briefs = listBriefsFiltered(store).filter((b) =>
          taskIds.includes(b.taskId),
        );

        const placeholders = taskIds.map(() => "?").join(",");
        const rows = (store.database
          .prepare(
            `SELECT items.* FROM items
             JOIN sources ON items.source_id = sources.id
             WHERE sources.task_id IN (${placeholders})`,
          )
          .all(...taskIds) as unknown) as SqlItemRow[];
        items = rows.map(mapSqlItem);
      }
    }
  } catch (e) {
    console.error("Error gathering grounding materials for chat:", e);
  }

  // 5. Generate AI Response
  let responseContent = "I apologize, but I encountered an error while formulating my response.";
  let responseCitations: string[] = [];

  try {
    const response = await generateChatResponse(formattedHistory, briefs, items);
    responseContent = response.content;
    responseCitations = response.citations;
  } catch (e) {
    console.error("AI response generation failed:", e);
  }

  // 6. Save AI Response
  createChatMessage(store, {
    threadId: thread.id,
    role: "assistant",
    content: responseContent,
    citations: responseCitations,
  });

  // 7. Revalidate relevant path
  if (scopeType === "brief") {
    revalidatePath(`/inbox/${scopeId}`);
  } else if (scopeType === "task") {
    // Get task to know spaceId for revalidation
    const task = store.database
      .prepare("SELECT space_id FROM tasks WHERE id = ?")
      .get(scopeId) as { space_id: string } | undefined;
    if (task) {
      revalidatePath(`/spaces/${task.space_id}/tasks/${scopeId}`);
    }
  } else if (scopeType === "space") {
    revalidatePath(`/spaces/${scopeId}`);
  }

  return { success: true };
}

export async function clearChatThread(scopeType: ChatScope, scopeId: string) {
  const store = defaultStore;
  const thread = getOrCreateChatThread(store, scopeType, scopeId);

  store.database
    .prepare("DELETE FROM chat_messages WHERE thread_id = ?")
    .run(thread.id);

  if (scopeType === "brief") {
    revalidatePath(`/inbox/${scopeId}`);
  } else if (scopeType === "task") {
    const task = store.database
      .prepare("SELECT space_id FROM tasks WHERE id = ?")
      .get(scopeId) as { space_id: string } | undefined;
    if (task) {
      revalidatePath(`/spaces/${task.space_id}/tasks/${scopeId}`);
    }
  } else if (scopeType === "space") {
    revalidatePath(`/spaces/${scopeId}`);
  }

  return { success: true };
}

export async function subscribeRecommendedSources(
  taskId: string,
  sources: Array<{ title: string; url: string; sourceType: "RSS" | "PAGE" | "STRUCTURED" }>,
) {
  const store = defaultStore;
  for (const s of sources) {
    createSourceRecord(store, {
      taskId,
      sourceType: s.sourceType,
      title: s.title,
      url: s.url,
    });
  }

  const task = store.database
    .prepare("SELECT space_id FROM tasks WHERE id = ?")
    .get(taskId) as { space_id: string } | undefined;
  if (task) {
    revalidatePath(`/spaces/${task.space_id}/tasks/${taskId}`);
    revalidatePath("/sources");
  }

  return { success: true };
}

export async function updateTaskControlSettings(
  taskId: string,
  relevanceLevel: number,
  summaryPreference: string,
) {
  updateTaskControls(defaultStore, taskId, relevanceLevel, summaryPreference);

  const task = defaultStore.database
    .prepare("SELECT space_id FROM tasks WHERE id = ?")
    .get(taskId) as { space_id: string } | undefined;
  if (task) {
    revalidatePath(`/spaces/${task.space_id}/tasks/${taskId}`);
  }

  return { success: true };
}
