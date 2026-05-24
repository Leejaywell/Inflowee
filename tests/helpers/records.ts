import type { BriefRecord, ItemRecord, TopicRecord } from "@/lib/store";

export function makeTopicRecord(overrides: Partial<TopicRecord> = {}): TopicRecord {
  return {
    id: "topic-1",
    ownerId: "local-user",
    title: "Monitor coding agents",
    topicType: "TOPIC",
    userPrompt: "Monitor autonomous coding agents and developer tools.",
    relevanceLevel: 3,
    summaryPreference: "balanced",
    topicProfile: null,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

export function makeItemRecord(overrides: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: "item-1",
    sourceId: "source-1",
    title: "Cognition announces Devin software assistant updates",
    canonicalUrl: "https://example.com/devin",
    summary: "Cognition released major capabilities enhancements to Devin.",
    rawContent: "Cognition released major capabilities enhancements to Devin.",
    origin: "example.com",
    language: "en",
    contentHash: "hash-item-1",
    structuredFields: null,
    isReal: true,
    relevanceScore: 0.8,
    relevanceReason: "Matched coding agents.",
    keywordMentioned: true,
    matchedTerms: ["coding", "agents"],
    qualityStatus: "accepted",
    qualityError: null,
    viewCount: null,
    likeCount: null,
    commentCount: null,
    shareCount: null,
    replyCount: null,
    repostCount: null,
    sourceNativeScore: null,
    authorName: null,
    authorUsername: null,
    authorFollowers: null,
    authorVerified: null,
    publishedAt: "2026-05-22T00:00:00.000Z",
    fetchedAt: "2026-05-22T00:00:00.000Z",
    createdAt: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

export function makeBriefRecord(overrides: Partial<BriefRecord> = {}): BriefRecord {
  return {
    id: "brief-1",
    topicId: "topic-1",
    title: "Devin updates announced",
    summary: "Autonomous coding agent achieves SWE-bench progress.",
    whyItMatters: "Advancements redefine agentic coding tools.",
    sourceCitations: ["https://example.com/devin"],
    relevanceScore: 0.8,
    importanceScore: 0.9,
    tags: ["agent"],
    isRead: false,
    createdAt: "2026-05-22T00:00:00.000Z",
    topicTitle: "Monitor coding agents",
    ...overrides,
  };
}
