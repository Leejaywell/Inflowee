"use server";

import { revalidatePath } from "next/cache";
import {
  assertBriefAccess,
  assertSpaceAccess,
  assertTaskAccess,
  getActorScopedChatScopeId,
  requireSessionActor,
} from "@/lib/auth";
import {
  deleteChatMessagesByThreadId,
  defaultStore,
  createChatMessage,
  createSourceRecord,
  getOrCreateChatThread,
  getTaskById,
  listChatMessages,
  updateTaskControls,
} from "@/lib/store";
import { answerGroundedQuestion } from "@/lib/ai";
import { getGroundingForScope, type GroundingResult } from "@/lib/grounding";
import { fetchLiveContext } from "@/lib/live-fetch";
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
  const actor = await requireSessionActor();

  if (scopeType === "space") {
    await assertSpaceAccess(store, {
      actorId: actor.id,
      spaceId: scopeId,
      minimumRole: "viewer",
    });
  } else if (scopeType === "task") {
    await assertTaskAccess(store, {
      actorId: actor.id,
      taskId: scopeId,
      minimumRole: "viewer",
    });
  } else if (scopeType === "brief") {
    await assertBriefAccess(store, {
      actorId: actor.id,
      briefId: scopeId,
      minimumRole: "viewer",
    });
  }

  const actorScopeId = getActorScopedChatScopeId(actor.id, scopeId);

  // 1. Get or create thread
  const thread = await getOrCreateChatThread(store, scopeType, actorScopeId);

  // 2. Insert user message
  await createChatMessage(store, {
    threadId: thread.id,
    role: "user",
    content: content.trim(),
  });

  // 3. Get entire chat history
  const messages = await listChatMessages(store, thread.id);
  const formattedHistory = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 4. Gather grounding materials depending on scope
  let grounding: GroundingResult = { briefs: [], items: [] };

  try {
    const fallbackSpaceId =
      scopeType === "task" ? (await getTaskById(store, scopeId))?.spaceId : undefined;
    grounding = await getGroundingForScope(store, scopeType, scopeId, {
      actorId: actor.id,
      fallbackSpaceId,
      includeSiblingFallback: scopeType === "task",
    });
  } catch (e) {
    console.error("Error gathering grounding materials for chat:", e);
  }

  // 5. Generate AI Response
  let responseContent = "I apologize, but I encountered an error while formulating my response.";
  let responseCitations: string[] = [];
  let responseProvenance: "stored" | "mixed" = "stored";

  try {
    const latestPrompt = formattedHistory.at(-1)?.content ?? content.trim();
    const response = await answerGroundedQuestion({
      prompt: latestPrompt,
      grounding,
      messages: formattedHistory,
      liveFetchImpl: fetchLiveContext,
    });
    responseContent = response.content;
    responseCitations = response.citations;
    responseProvenance = response.provenance;
  } catch (e) {
    console.error("AI response generation failed:", e);
  }

  // 6. Save AI Response
  await createChatMessage(store, {
    threadId: thread.id,
    role: "assistant",
    content: responseContent,
    citations: responseCitations,
    provenance: responseProvenance,
  });

  // 7. Revalidate relevant path
  if (scopeType === "brief") {
    revalidatePath(`/inbox/${scopeId}`);
  } else if (scopeType === "task") {
    const task = await getTaskById(store, scopeId);
    if (task) {
      revalidatePath(`/spaces/${task.spaceId}/tasks/${scopeId}`);
    }
  } else if (scopeType === "space") {
    revalidatePath(`/spaces/${scopeId}`);
  }

  return {
    success: true,
    provenance: responseProvenance,
    citations: responseCitations,
  };
}

export async function clearChatThread(scopeType: ChatScope, scopeId: string) {
  const store = defaultStore;
  const actor = await requireSessionActor();

  if (scopeType === "space") {
    await assertSpaceAccess(store, {
      actorId: actor.id,
      spaceId: scopeId,
      minimumRole: "viewer",
    });
  } else if (scopeType === "task") {
    await assertTaskAccess(store, {
      actorId: actor.id,
      taskId: scopeId,
      minimumRole: "viewer",
    });
  } else if (scopeType === "brief") {
    await assertBriefAccess(store, {
      actorId: actor.id,
      briefId: scopeId,
      minimumRole: "viewer",
    });
  }

  const actorScopeId = getActorScopedChatScopeId(actor.id, scopeId);
  const thread = await getOrCreateChatThread(store, scopeType, actorScopeId);

  await deleteChatMessagesByThreadId(store, thread.id);

  if (scopeType === "brief") {
    revalidatePath(`/inbox/${scopeId}`);
  } else if (scopeType === "task") {
    const task = await getTaskById(store, scopeId);
    if (task) {
      revalidatePath(`/spaces/${task.spaceId}/tasks/${scopeId}`);
    }
  } else if (scopeType === "space") {
    revalidatePath(`/spaces/${scopeId}`);
  }

  return { success: true };
}

export async function subscribeRecommendedSources(
  taskId: string,
  sources: Array<{
    title: string;
    url: string;
    sourceType:
      | "RSS"
      | "PAGE"
      | "STRUCTURED"
      | "UPDATE"
      | "NEWSLETTER"
      | "TELEGRAM_PUBLIC"
      | "TELEGRAM_BOT";
  }>,
) {
  const store = defaultStore;
  const actor = await requireSessionActor();
  await assertTaskAccess(store, {
    actorId: actor.id,
    taskId,
    minimumRole: "editor",
  });
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

    await createSourceRecord(store, {
      taskId: result.data.taskId,
      sourceType: result.data.sourceType,
      title: result.data.title,
      url: result.data.url,
    });
  }

  const task = await getTaskById(store, taskId);
  if (task) {
    revalidatePath(`/spaces/${task.spaceId}/tasks/${taskId}`);
    revalidatePath("/sources");
  }

  return { success: true };
}

export async function updateTaskControlSettings(
  taskId: string,
  relevanceLevel: number,
  summaryPreference: string,
) {
  const actor = await requireSessionActor();
  await assertTaskAccess(defaultStore, {
    actorId: actor.id,
    taskId,
    minimumRole: "editor",
  });

  await updateTaskControls(
    defaultStore,
    taskId,
    relevanceLevel,
    summaryPreference,
  );

  const task = await getTaskById(defaultStore, taskId);
  if (task) {
    revalidatePath(`/spaces/${task.spaceId}/tasks/${taskId}`);
  }

  return { success: true };
}
