"use server";

import { revalidatePath } from "next/cache";
import {
  defaultStore,
  getOrCreateChatThread,
  createChatMessage,
  listChatMessages,
  createSourceRecord,
  updateTaskControls,
} from "@/lib/store";
import { generateChatResponse } from "@/lib/ai";
import { getGroundingForScope, type GroundingResult } from "@/lib/grounding";
import { createSourceSchema } from "@/lib/validation";

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
  let grounding: GroundingResult = { briefs: [], items: [] };

  try {
    if (scopeType !== "global") {
      grounding = getGroundingForScope(store, scopeType, scopeId);
    }
  } catch (e) {
    console.error("Error gathering grounding materials for chat:", e);
  }

  // 5. Generate AI Response
  let responseContent = "I apologize, but I encountered an error while formulating my response.";
  let responseCitations: string[] = [];

  try {
    const response = await generateChatResponse(
      formattedHistory,
      grounding.briefs,
      grounding.items,
    );
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
  const parsedSources = sources.map((source, index) => ({
    index,
    result: createSourceSchema.safeParse({
      taskId,
      sourceType: source.sourceType,
      title: source.title,
      url: source.url,
    }),
  }));
  const invalidSource = parsedSources.find(({ result }) => !result.success);

  if (invalidSource && !invalidSource.result.success) {
    const issue = invalidSource.result.error.issues[0]?.message ?? "Invalid source input.";
    throw new Error(
      `Recommended source ${invalidSource.index + 1} is invalid: ${issue}`,
    );
  }

  for (const { result } of parsedSources) {
    if (!result.success) {
      continue;
    }

    createSourceRecord(store, {
      taskId: result.data.taskId,
      sourceType: result.data.sourceType,
      title: result.data.title,
      url: result.data.url,
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
