"use server";

import { revalidatePath } from "next/cache";
import {
  assertBriefAccess,
  assertTopicAccess,
  getActorScopedChatScopeId,
  requireSessionActor,
} from "@/lib/auth";
import {
  deleteChatMessagesByThreadId,
  defaultStore,
  createChatMessage,
  createSourceRecord,
  createTopicRecord,
  getOrCreateChatThread,
  getTopicById,
  listChatMessages,
  updateTopicControls,
} from "@/lib/store";
import { answerGroundedQuestion } from "@/lib/ai";
import { getGroundingForScope, type GroundingResult } from "@/lib/grounding";
import { fetchLiveContext } from "@/lib/live-fetch";
import { createSourceSchema, createTopicSchema } from "@/lib/validation";
import { refreshTopicIntelligence } from "@/lib/topic-intelligence";
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
  type DiscoverySourceCandidate,
} from "@/lib/discovery-catalog";
import {
  buildGenericDiscoveryExperience,
  buildTopicDiscoveryExperience,
} from "@/lib/discovery-runtime";
import { createDiscoverySourcesForTopic } from "@/lib/discovery-subscriptions";

type ChatScope = "global" | "topic" | "brief";

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

  if (scopeType === "topic") {
    await assertTopicAccess(store, {
      actorId: actor.id,
      topicId: scopeId,
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
  } else if (scopeType === "topic") {
    revalidatePath(`/topics/${scopeId}`);
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

  if (scopeType === "topic") {
    await assertTopicAccess(store, {
      actorId: actor.id,
      topicId: scopeId,
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
  } else if (scopeType === "topic") {
    revalidatePath(`/topics/${scopeId}`);
  }

  return { success: true };
}

export async function subscribeRecommendedSources(
  topicId: string,
  sources: SourceCandidateInput[],
) {
  const store = defaultStore;
  const actor = await requireSessionActor();
  await assertTopicAccess(store, {
    actorId: actor.id,
    topicId,
  });
  const parsedSources = sources.map((source, index) => ({
    index,
    result: createSourceSchema.safeParse({
      topicId,
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
  const topic = await getTopicById(store, topicId);

  if (!topic) {
    throw new Error("Topic not found.");
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
      topicId: result.data.topicId,
      sourceType: result.data.sourceType,
      title: result.data.title,
      url: isHotlist
        ? buildHotlistSourceUrl()
        : isDiscovery
        ? buildRadarSourceUrl(result.data.sourceType)
        : result.data.url,
      configJson: isHotlist
        ? buildHotlistSourceConfig(topic)
        : isDiscovery
        ? buildRadarSourceConfig(topic, result.data.sourceType)
        : null,
    });
    createdSourceIds.push(sourceId);
  }

  for (const sourceId of createdSourceIds) {
    await syncSourceById(store, sourceId);
  }

  if (topic) {
    revalidatePath(`/topics/${topicId}`);
    revalidatePath("/sources");
    revalidatePath("/inbox");
  }

  return { success: true };
}

export async function subscribeDiscoverySources(
  topicId: string,
  candidateIds: string[],
  context: { categoryId?: string; selectedTagIds?: string[] } = {},
) {
  const store = defaultStore;
  const actor = await requireSessionActor();
  await assertTopicAccess(store, {
    actorId: actor.id,
    topicId,
  });

  const topic = await getTopicById(store, topicId);

  if (!topic) {
    throw new Error("Topic not found.");
  }

  const allowedIds = new Set(candidateIds);
  const discoveryExperience = await buildTopicDiscoveryExperience(store, topic, context);
  let candidates: DiscoverySourceCandidate[] =
    discoveryExperience.candidates.filter((candidate) => allowedIds.has(candidate.id));

  if (candidates.length === 0) {
    candidates = buildGenericDiscoveryExperience().candidates.filter((candidate) =>
      allowedIds.has(candidate.id),
    );
  }

  if (candidates.length === 0) {
    throw new Error("Select at least one valid discovery source.");
  }

  const result = await createDiscoverySourcesForTopic(store, topicId, candidates, {
    syncImmediately: true,
  });

  revalidatePath(`/topics/${topicId}`);
  revalidatePath("/discover");
  revalidatePath("/sources");
  revalidatePath("/inbox");

  return {
    success: true,
    ...result,
  };
}

export async function createTopicAndSubscribeDiscoverySources(input: {
  title: string;
  userPrompt?: string;
  candidateIds: string[];
  categoryId?: string;
  selectedTagIds?: string[];
}) {
  const store = defaultStore;
  const actor = await requireSessionActor();
  const allowedIds = new Set(input.candidateIds);
  let candidates: DiscoverySourceCandidate[] =
    buildGenericDiscoveryExperience().candidates.filter((candidate) =>
      allowedIds.has(candidate.id),
    );
  if (candidates.length === 0) {
    throw new Error("Select at least one valid discovery source.");
  }

  const title =
    input.title.trim() ||
    candidates[0]?.title?.slice(0, 28) ||
    (input.categoryId ? `${input.categoryId} 话题` : "发现话题");
  const userPrompt =
    input.userPrompt?.trim() ||
    `订阅话题「${title}」，关注来源：${candidates
      .slice(0, 5)
      .map((candidate) => candidate.title)
      .join("、")}。`;
  const parsed = createTopicSchema.safeParse({
    title,
    topicType: "TOPIC",
    userPrompt,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid Topic input.");
  }

  const topicId = await createTopicRecord(store, {
    ...parsed.data,
    ownerId: actor.id,
  });

  try {
    await refreshTopicIntelligence(store, topicId);
  } catch (error) {
    console.error(`Failed to initialize topic intelligence for ${topicId}:`, error);
  }

  const topic = await getTopicById(store, topicId);
  if (!topic) {
    throw new Error("Topic not found after creation.");
  }

  const discoveryExperience = await buildTopicDiscoveryExperience(store, topic, {
    categoryId: input.categoryId,
    selectedTagIds: input.selectedTagIds,
  });
  candidates =
    discoveryExperience.candidates.filter((candidate) => allowedIds.has(candidate.id));

  if (candidates.length === 0) {
    candidates = buildGenericDiscoveryExperience().candidates.filter((candidate) =>
      allowedIds.has(candidate.id),
    );
  }

  if (candidates.length === 0) {
    throw new Error("Select at least one valid discovery source.");
  }

  const result = await createDiscoverySourcesForTopic(store, topicId, candidates, {
    syncImmediately: true,
  });

  revalidatePath("/");
  revalidatePath(`/topics/${topicId}`);
  revalidatePath("/discover");
  revalidatePath("/sources");
  revalidatePath("/inbox");

  return {
    success: true,
    topicId,
    ...result,
  };
}

export async function previewRecommendedSources(
  topicId: string,
  sources: SourceCandidateInput[],
) {
  const store = defaultStore;
  const actor = await requireSessionActor();
  await assertTopicAccess(store, {
    actorId: actor.id,
    topicId,
  });

  const parsedSources = sources.map((source, index) => ({
    index,
    result: createSourceSchema.safeParse({
      topicId,
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
    topicId,
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

export async function updateTopicControlSettings(
  topicId: string,
  relevanceLevel: number,
  summaryPreference: string,
) {
  const actor = await requireSessionActor();
  await assertTopicAccess(defaultStore, {
    actorId: actor.id,
    topicId,
  });

  await updateTopicControls(
    defaultStore,
    topicId,
    relevanceLevel,
    summaryPreference,
  );

  const topic = await getTopicById(defaultStore, topicId);
  if (topic) {
    revalidatePath(`/topics/${topicId}`);
  }

  return { success: true };
}
