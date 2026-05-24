import type { TopicProfile } from "@/lib/ai";
import type { ItemRecord, TopicRecord } from "@/lib/store";

export type CandidateHeatMetrics = {
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  replyCount?: number | null;
  repostCount?: number | null;
  sourceNativeScore?: number | null;
  authorName?: string | null;
  authorUsername?: string | null;
  authorFollowers?: number | null;
  authorVerified?: boolean | null;
};

export type QualityCandidate = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  rawContent?: string | null;
  structuredFields?: Record<string, unknown> | null;
} & CandidateHeatMetrics;

export type ItemQualityResult = {
  isReal: boolean;
  relevanceScore: number;
  relevanceReason: string;
  keywordMentioned: boolean;
  matchedTerms: string[];
  qualityStatus: ItemRecord["qualityStatus"];
  qualityError: string | null;
} & Required<CandidateHeatMetrics>;

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "from",
  "into",
  "latest",
  "monitor",
  "monitoring",
  "new",
  "news",
  "the",
  "this",
  "tool",
  "tools",
  "update",
  "updates",
  "with",
]);

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s.+#-]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

export function expandQualityTerms(topic: TopicRecord): string[] {
  const profile = topic.topicProfile as TopicProfile | null | undefined;
  const terms = new Set<string>();

  for (const term of [
    topic.title,
    topic.userPrompt,
    ...(profile?.keywords ?? []),
    ...(profile?.suggestedQueries ?? []),
  ]) {
    for (const token of tokenize(term)) {
      terms.add(token);
    }
  }

  return [...terms].slice(0, 30);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function normalizeHeatMetrics(
  candidate: QualityCandidate,
): Required<CandidateHeatMetrics> {
  const structured = candidate.structuredFields ?? {};

  return {
    viewCount: numberOrNull(candidate.viewCount ?? structured.viewCount),
    likeCount: numberOrNull(candidate.likeCount ?? structured.likeCount),
    commentCount: numberOrNull(candidate.commentCount ?? structured.commentCount),
    shareCount: numberOrNull(candidate.shareCount ?? structured.shareCount),
    replyCount: numberOrNull(candidate.replyCount ?? structured.replyCount),
    repostCount: numberOrNull(candidate.repostCount ?? structured.repostCount),
    sourceNativeScore: numberOrNull(
      candidate.sourceNativeScore ?? structured.sourceNativeScore,
    ),
    authorName:
      typeof (candidate.authorName ?? structured.authorName) === "string"
        ? String(candidate.authorName ?? structured.authorName)
        : null,
    authorUsername:
      typeof (candidate.authorUsername ?? structured.authorUsername) === "string"
        ? String(candidate.authorUsername ?? structured.authorUsername)
        : null,
    authorFollowers: numberOrNull(
      candidate.authorFollowers ?? structured.authorFollowers,
    ),
    authorVerified: booleanOrNull(
      candidate.authorVerified ?? structured.authorVerified,
    ),
  };
}

export function analyzeItemQuality(
  topic: TopicRecord,
  candidate: QualityCandidate,
): ItemQualityResult {
  const heatMetrics = normalizeHeatMetrics(candidate);
  const content = [
    candidate.title,
    candidate.summary,
    candidate.rawContent,
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedContent = normalizeText(content);
  const terms = expandQualityTerms(topic);
  const matchedTerms = terms.filter((term) =>
    normalizedContent.includes(normalizeText(term)),
  );

  let isReal = true;
  let qualityError: string | null = null;

  try {
    const url = new URL(candidate.canonicalUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      isReal = false;
      qualityError = "Candidate URL is not a public web URL.";
    }
  } catch {
    isReal = false;
    qualityError = "Candidate URL is invalid.";
  }

  if (!candidate.title.trim() || normalizedContent.length < 24) {
    isReal = false;
    qualityError = "Candidate has too little readable content.";
  }

  const keywordMentioned = matchedTerms.length > 0;
  const termCoverage = terms.length > 0 ? matchedTerms.length / terms.length : 0;
  const titleBoost = matchedTerms.some((term) =>
    normalizeText(candidate.title).includes(normalizeText(term)),
  )
    ? 0.18
    : 0;
  const heatBoost = Math.min(
    0.12,
    ((heatMetrics.commentCount ?? 0) +
      (heatMetrics.replyCount ?? 0) +
      (heatMetrics.likeCount ?? 0) / 10 +
      (heatMetrics.sourceNativeScore ?? 0) / 20) /
      100,
  );
  const relevanceScore = Math.min(
    1,
    Number((0.28 + termCoverage * 2.2 + titleBoost + heatBoost).toFixed(2)),
  );

  let qualityStatus: ItemRecord["qualityStatus"] = "accepted";
  let relevanceReason = keywordMentioned
    ? `Matched ${matchedTerms.slice(0, 5).join(", ")}.`
    : "No monitoring keywords were directly mentioned.";

  if (!isReal) {
    qualityStatus = "rejected";
  } else if (relevanceScore < 0.5) {
    qualityStatus = "rejected";
    qualityError = "Relevance score is below the quality threshold.";
  } else if (!keywordMentioned && relevanceScore < 0.65) {
    qualityStatus = "rejected";
    qualityError = "No keyword match and relevance is not strong enough.";
  }

  if (qualityStatus === "rejected" && qualityError) {
    relevanceReason = qualityError;
  }

  return {
    isReal,
    relevanceScore,
    relevanceReason,
    keywordMentioned,
    matchedTerms,
    qualityStatus,
    qualityError,
    ...heatMetrics,
  };
}
