"use server";

import { revalidatePath } from "next/cache";
import {
  assertBriefAccess,
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
import {
  previewSubscriptionSources,
  syncSourceById,
  type SourceCandidateInput,
} from "@/lib/source-ingestion";
import {
  buildRadarSourceConfig,
  buildRadarSourceUrl,
} from "@/lib/radar-discovery";
import {
  buildHotlistSourceConfig,
  buildHotlistSourceUrl,
} from "@/lib/hotlist-discovery";
import {
  getDiscoverySourceCandidates,
  type DiscoverySourceCandidate,
} from "@/lib/discovery-catalog";
import { createDiscoverySourcesForTask } from "@/lib/discovery-subscriptions";

type ChatScope = "global" | "task" | "brief";

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

  if (scopeType === "task") {
    await assertTaskAccess(store, {
      actorId: actor.id,
      taskId: scopeId,
    });
  } else if (scopeType === "brief") {
    await assertBriefAccess(store, {
      actorId: actor.id,
      briefId: scopeId,
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
    grounding = await getGroundingForScope(store, scopeType, scopeId, {
      actorId: actor.id,
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
    revalidatePath(`/tasks/${scopeId}`);
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

  if (scopeType === "task") {
    await assertTaskAccess(store, {
      actorId: actor.id,
      taskId: scopeId,
    });
  } else if (scopeType === "brief") {
    await assertBriefAccess(store, {
      actorId: actor.id,
      briefId: scopeId,
    });
  }

  const actorScopeId = getActorScopedChatScopeId(actor.id, scopeId);
  const thread = await getOrCreateChatThread(store, scopeType, actorScopeId);

  await deleteChatMessagesByThreadId(store, thread.id);

  if (scopeType === "brief") {
    revalidatePath(`/inbox/${scopeId}`);
  } else if (scopeType === "task") {
    revalidatePath(`/tasks/${scopeId}`);
  }

  return { success: true };
}

export async function subscribeRecommendedSources(
  taskId: string,
  sources: SourceCandidateInput[],
) {
  const store = defaultStore;
  const actor = await requireSessionActor();
  await assertTaskAccess(store, {
    actorId: actor.id,
    taskId,
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

  const createdSourceIds: string[] = [];
  const task = await getTaskById(store, taskId);

  if (!task) {
    throw new Error("Task not found.");
  }

  for (const { result } of parsedSources) {
    if (!result.success) {
      continue;
    }

    const isDiscovery =
      result.data.sourceType === "SEARCH_DISCOVERY" ||
      result.data.sourceType === "COMMUNITY_DISCOVERY" ||
      result.data.sourceType === "SOCIAL_DISCOVERY" ||
      result.data.sourceType === "HOTLIST_DISCOVERY";
    const isHotlist = result.data.sourceType === "HOTLIST_DISCOVERY";
    const sourceId = await createSourceRecord(store, {
      taskId: result.data.taskId,
      sourceType: result.data.sourceType,
      title: result.data.title,
      url: isHotlist
        ? buildHotlistSourceUrl()
        : isDiscovery
        ? buildRadarSourceUrl(result.data.sourceType)
        : result.data.url,
      configJson: isHotlist
        ? buildHotlistSourceConfig(task)
        : isDiscovery
        ? buildRadarSourceConfig(task, result.data.sourceType)
        : null,
    });
    createdSourceIds.push(sourceId);
  }

  for (const sourceId of createdSourceIds) {
    await syncSourceById(store, sourceId);
  }

  if (task) {
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/sources");
    revalidatePath("/inbox");
  }

  return { success: true };
}

export async function subscribeDiscoverySources(
  taskId: string,
  candidateIds: string[],
) {
  const store = defaultStore;
  const actor = await requireSessionActor();
  await assertTaskAccess(store, {
    actorId: actor.id,
    taskId,
  });

  const task = await getTaskById(store, taskId);

  if (!task) {
    throw new Error("Task not found.");
  }

  const allowedIds = new Set(candidateIds);
  const candidates: DiscoverySourceCandidate[] = getDiscoverySourceCandidates(
    task.taskProfile ?? null,
  ).filter((candidate) => allowedIds.has(candidate.id));

  if (candidates.length === 0) {
    throw new Error("Select at least one valid discovery source.");
  }

  const result = await createDiscoverySourcesForTask(store, taskId, candidates);

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/sources");
  revalidatePath("/inbox");

  return {
    success: true,
    ...result,
  };
}

export async function previewRecommendedSources(
  taskId: string,
  sources: SourceCandidateInput[],
) {
  const store = defaultStore;
  const actor = await requireSessionActor();
  await assertTaskAccess(store, {
    actorId: actor.id,
    taskId,
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

  return previewSubscriptionSources(
    store,
    taskId,
    parsedSources
      .filter(({ result }) => result.success)
      .map(({ result }) => {
        if (!result.success) {
          throw new Error("Unexpected invalid source.");
        }

        return {
          title: result.data.title,
          url: result.data.url,
          sourceType: result.data.sourceType,
        };
      }),
  );
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
  });

  await updateTaskControls(
    defaultStore,
    taskId,
    relevanceLevel,
    summaryPreference,
  );

  const task = await getTaskById(defaultStore, taskId);
  if (task) {
    revalidatePath(`/tasks/${taskId}`);
  }

  return { success: true };
}
