import * as cheerio from "cheerio";

import { fetchSourceFeed } from "@/lib/source-sync";
import type { SourceRecord, TopicRecord } from "@/lib/store";
import { expandQualityTerms, type CandidateHeatMetrics } from "@/lib/item-quality";

export type HotlistProvider =
  | "baidu"
  | "weibo"
  | "zhihu"
  | "bilibili"
  | "toutiao"
  | "douyin"
  | "the-paper"
  | "cls";

export type HotlistCandidate = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  rawContent?: string | null;
  publishedAt: string | null;
  structuredFields?: Record<string, unknown> | null;
} & CandidateHeatMetrics;

export type HotlistProviderFailure = {
  provider: HotlistProvider;
  error: string;
};

export type HotlistDiscoveryResult = {
  candidates: HotlistCandidate[];
  failures: HotlistProviderFailure[];
};

export type HotlistSourceConfig = {
  providers: HotlistProvider[];
  queries: string[];
  providerQuota: number;
  totalQuota: number;
};

const HOTLIST_PROVIDERS: HotlistProvider[] = [
  "baidu",
  "weibo",
  "zhihu",
  "bilibili",
  "toutiao",
  "douyin",
  "the-paper",
  "cls",
];

const DEFAULT_HOTLIST_PROVIDERS: HotlistProvider[] = [
  "baidu",
  "weibo",
  "zhihu",
  "bilibili",
];

const providerUrls: Record<HotlistProvider, string> = {
  baidu: "https://top.baidu.com/board?tab=realtime",
  weibo: "https://s.weibo.com/top/summary",
  zhihu: "https://www.zhihu.com/hot",
  bilibili: "https://www.bilibili.com/v/popular/rank/all",
  toutiao: "https://www.toutiao.com/hot-event/hot-board/",
  douyin: "https://www.douyin.com/hot",
  "the-paper": "https://www.thepaper.cn/",
  cls: "https://www.cls.cn/telegraph",
};

const providerLabels: Record<HotlistProvider, string> = {
  baidu: "Baidu Hot Search",
  weibo: "Weibo Hot Search",
  zhihu: "Zhihu Hot List",
  bilibili: "Bilibili Ranking",
  toutiao: "Toutiao Hot Board",
  douyin: "Douyin Hot List",
  "the-paper": "The Paper",
  cls: "Cailian Press",
};

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function buildHotlistSourceUrl() {
  return "radar://hotlist-discovery";
}

export function expandHotlistQueries(topic: TopicRecord): string[] {
  const profile = topic.topicProfile;
  const qualityTerms = expandQualityTerms(topic).slice(0, 10);
  const profileQueries = Array.isArray(profile?.suggestedQueries)
    ? profile.suggestedQueries
    : [];

  return uniqueValues([
    ...profileQueries,
    topic.userPrompt,
    topic.title,
    ...qualityTerms.slice(0, 6),
  ]).slice(0, 12);
}

export function buildHotlistSourceConfig(topic: TopicRecord): HotlistSourceConfig {
  return {
    providers: [...DEFAULT_HOTLIST_PROVIDERS],
    queries: expandHotlistQueries(topic),
    providerQuota: 20,
    totalQuota: 60,
  };
}

function getHotlistConfig(topic: TopicRecord, source: SourceRecord): HotlistSourceConfig {
  const fallback = buildHotlistSourceConfig(topic);
  const raw = source.configJson ?? {};

  return {
    providers: Array.isArray(raw.providers)
      ? raw.providers.filter((provider): provider is HotlistProvider =>
          HOTLIST_PROVIDERS.includes(String(provider) as HotlistProvider),
        )
      : fallback.providers,
    queries: Array.isArray(raw.queries)
      ? raw.queries.map(String).filter(Boolean)
      : fallback.queries,
    providerQuota:
      typeof raw.providerQuota === "number" ? raw.providerQuota : fallback.providerQuota,
    totalQuota:
      typeof raw.totalQuota === "number" ? raw.totalQuota : fallback.totalQuota,
  };
}

function extractHotScore(text: string) {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(万|亿|k|K|m|M)?/);
  if (!match) {
    return null;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return null;
  }

  const unit = match[2]?.toLowerCase();
  if (unit === "亿") {
    return base * 100_000_000;
  }
  if (unit === "万") {
    return base * 10_000;
  }
  if (unit === "m") {
    return base * 1_000_000;
  }
  if (unit === "k") {
    return base * 1_000;
  }

  return base;
}

function parseHotlistHtml(
  html: string,
  provider: HotlistProvider,
  sourceUrl: string,
  quota: number,
): HotlistCandidate[] {
  const $ = cheerio.load(html);
  const candidates: HotlistCandidate[] = [];
  const seen = new Set<string>();
  const selectors = [
    "[class*='hot'] a",
    "[class*='rank'] a",
    "[class*='board'] a",
    "[class*='list'] a",
    "article a",
    "li a",
    "a",
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      if (candidates.length >= quota) {
        return;
      }

      const $link = $(element);
      const title = $link.text().replace(/\s+/g, " ").trim();
      const href = $link.attr("href");
      if (!title || title.length < 2 || !href) {
        return;
      }

      let canonicalUrl: string;
      try {
        canonicalUrl = new URL(href, sourceUrl).href;
      } catch {
        return;
      }

      if (seen.has(canonicalUrl) || canonicalUrl.startsWith("javascript:")) {
        return;
      }

      const containerText = $link
        .closest("li, article, tr, div")
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const rank = candidates.length + 1;
      const hotScore = extractHotScore(containerText.replace(title, ""));

      candidates.push({
        title,
        canonicalUrl,
        summary: containerText && containerText !== title ? containerText : null,
        rawContent: containerText || title,
        publishedAt: new Date().toISOString(),
        sourceNativeScore: hotScore,
        structuredFields: {
          sourceProvider: provider,
          platform: providerLabels[provider],
          rank,
          hotScore,
          providerUrl: sourceUrl,
        },
      });
      seen.add(canonicalUrl);
    });

    if (candidates.length > 0) {
      break;
    }
  }

  return candidates;
}

function dedupeCandidates(candidates: HotlistCandidate[]) {
  const seen = new Set<string>();
  const result: HotlistCandidate[] = [];

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

async function fetchHotlistProviderCandidates(
  provider: HotlistProvider,
  quota: number,
  fetchSourceFeedImpl: typeof fetchSourceFeed,
) {
  const sourceUrl = providerUrls[provider];
  const html = await fetchSourceFeedImpl(sourceUrl, {
    signal: AbortSignal.timeout(10_000),
  });

  return parseHotlistHtml(html, provider, sourceUrl, quota);
}

export async function discoverHotlistCandidates(
  topic: TopicRecord,
  source: SourceRecord,
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
  },
): Promise<HotlistDiscoveryResult> {
  const config = getHotlistConfig(topic, source);
  const fetchSourceFeedImpl = options?.fetchSourceFeedImpl ?? fetchSourceFeed;
  const candidates: HotlistCandidate[] = [];
  const failures: HotlistProviderFailure[] = [];

  for (const provider of config.providers) {
    if (candidates.length >= config.totalQuota) {
      break;
    }

    try {
      const providerCandidates = await fetchHotlistProviderCandidates(
        provider,
        config.providerQuota,
        fetchSourceFeedImpl,
      );
      candidates.push(...providerCandidates);
    } catch (error) {
      failures.push({
        provider,
        error: error instanceof Error ? error.message : "Unknown provider error.",
      });
    }
  }

  return {
    candidates: dedupeCandidates(candidates).slice(0, config.totalQuota),
    failures,
  };
}
