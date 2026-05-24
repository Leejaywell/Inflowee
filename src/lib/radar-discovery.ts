import { parseFeedItems } from "@/lib/rss";
import { fetchSourceFeed } from "@/lib/source-sync";
import type { SourceRecord, TaskRecord } from "@/lib/store";
import { expandQualityTerms, type CandidateHeatMetrics } from "@/lib/item-quality";

export type RadarProvider = "bing" | "hacker-news" | "weibo" | "bilibili";

export type RadarCandidate = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  rawContent?: string | null;
  publishedAt: string | null;
  structuredFields?: Record<string, unknown> | null;
} & CandidateHeatMetrics;

export type RadarProviderFailure = {
  provider: RadarProvider;
  error: string;
};

export type RadarDiscoveryResult = {
  candidates: RadarCandidate[];
  failures: RadarProviderFailure[];
};

export type RadarSourceConfig = {
  providers: RadarProvider[];
  queries: string[];
  freshnessDays: number;
  providerQuota: number;
  totalQuota: number;
};

const DEFAULT_PROVIDERS: RadarProvider[] = ["bing", "hacker-news"];

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function buildRadarSourceUrl(sourceType: SourceRecord["sourceType"]) {
  if (sourceType === "COMMUNITY_DISCOVERY") {
    return "radar://community-discovery";
  }

  if (sourceType === "SOCIAL_DISCOVERY") {
    return "radar://social-discovery";
  }

  return "radar://search-discovery";
}

export function expandRadarQueries(task: TaskRecord): string[] {
  const profile = task.taskProfile;
  const qualityTerms = expandQualityTerms(task).slice(0, 10);
  const profileQueries = Array.isArray(profile?.suggestedQueries)
    ? profile.suggestedQueries
    : [];

  return uniqueValues([
    ...profileQueries,
    task.userPrompt,
    `${task.title} news`,
    `${task.title} update`,
    qualityTerms.slice(0, 4).join(" "),
  ]).slice(0, 8);
}

export function buildRadarSourceConfig(
  task: TaskRecord,
  sourceType: SourceRecord["sourceType"],
): RadarSourceConfig {
  const providers =
    sourceType === "COMMUNITY_DISCOVERY"
      ? ["hacker-news" as const]
      : sourceType === "SOCIAL_DISCOVERY"
      ? (["weibo", "bilibili"] as const)
      : DEFAULT_PROVIDERS;

  return {
    providers: [...providers],
    queries: expandRadarQueries(task),
    freshnessDays: 7,
    providerQuota: 10,
    totalQuota: 30,
  };
}

function getRadarConfig(task: TaskRecord, source: SourceRecord): RadarSourceConfig {
  const fallback = buildRadarSourceConfig(task, source.sourceType);
  const raw = source.configJson ?? {};

  return {
    providers: Array.isArray(raw.providers)
      ? raw.providers.filter((provider): provider is RadarProvider =>
          ["bing", "hacker-news", "weibo", "bilibili"].includes(String(provider)),
        )
      : fallback.providers,
    queries: Array.isArray(raw.queries)
      ? raw.queries.map(String).filter(Boolean)
      : fallback.queries,
    freshnessDays:
      typeof raw.freshnessDays === "number" ? raw.freshnessDays : fallback.freshnessDays,
    providerQuota:
      typeof raw.providerQuota === "number" ? raw.providerQuota : fallback.providerQuota,
    totalQuota:
      typeof raw.totalQuota === "number" ? raw.totalQuota : fallback.totalQuota,
  };
}

function dedupeCandidates(candidates: RadarCandidate[]) {
  const seen = new Set<string>();
  const result: RadarCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.canonicalUrl.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

async function fetchBingNewsCandidates(
  query: string,
  quota: number,
  fetchImpl: typeof fetchSourceFeed,
): Promise<RadarCandidate[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const xml = await fetchImpl(url, {
    signal: AbortSignal.timeout(10_000),
  });

  return parseFeedItems(xml).slice(0, quota).map((item) => ({
    ...item,
    rawContent: item.summary,
    structuredFields: {
      sourceProvider: "bing",
      query,
    },
  }));
}

async function fetchHackerNewsCandidates(
  query: string,
  quota: number,
  fetchImpl: typeof fetch,
): Promise<RadarCandidate[]> {
  const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=${quota}&query=${encodeURIComponent(query)}`;
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Hacker News search failed with ${response.status}.`);
  }

  const data = (await response.json()) as {
    hits?: Array<{
      title?: string;
      url?: string;
      objectID?: string;
      points?: number;
      num_comments?: number;
      author?: string;
      created_at?: string;
    }>;
  };

  return (data.hits ?? [])
    .filter((hit) => hit.title)
    .slice(0, quota)
    .map((hit) => {
      const hnUrl = `https://news.ycombinator.com/item?id=${hit.objectID ?? ""}`;

      return {
        title: hit.title ?? "Hacker News discussion",
        canonicalUrl: hit.url || hnUrl,
        summary: `Hacker News discussion for ${hit.title ?? query}.`,
        rawContent: hit.title ?? null,
        publishedAt: hit.created_at ?? null,
        commentCount: hit.num_comments ?? null,
        sourceNativeScore: hit.points ?? null,
        authorUsername: hit.author ?? null,
        structuredFields: {
          sourceProvider: "hacker-news",
          sourceNativeId: hit.objectID,
          discussionUrl: hnUrl,
          query,
        },
      };
    });
}

async function fetchProviderCandidates(
  provider: RadarProvider,
  query: string,
  quota: number,
  fetchSourceFeedImpl: typeof fetchSourceFeed,
  fetchImpl: typeof fetch,
) {
  if (provider === "bing") {
    return fetchBingNewsCandidates(query, quota, fetchSourceFeedImpl);
  }

  if (provider === "hacker-news") {
    return fetchHackerNewsCandidates(query, quota, fetchImpl);
  }

  throw new Error(`${provider} discovery is not configured yet.`);
}

export async function discoverRadarCandidates(
  task: TaskRecord,
  source: SourceRecord,
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
    fetchImpl?: typeof fetch;
  },
): Promise<RadarDiscoveryResult> {
  const config = getRadarConfig(task, source);
  const fetchSourceFeedImpl = options?.fetchSourceFeedImpl ?? fetchSourceFeed;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const candidates: RadarCandidate[] = [];
  const failures: RadarProviderFailure[] = [];

  for (const provider of config.providers) {
    for (const query of config.queries.slice(0, 3)) {
      if (candidates.length >= config.totalQuota) {
        break;
      }

      try {
        const providerCandidates = await fetchProviderCandidates(
          provider,
          query,
          config.providerQuota,
          fetchSourceFeedImpl,
          fetchImpl,
        );
        candidates.push(...providerCandidates);
      } catch (error) {
        failures.push({
          provider,
          error: error instanceof Error ? error.message : "Unknown provider error.",
        });
      }
    }
  }

  return {
    candidates: dedupeCandidates(candidates).slice(0, config.totalQuota),
    failures,
  };
}
