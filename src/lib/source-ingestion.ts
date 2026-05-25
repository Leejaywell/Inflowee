import { extractPageContent } from "@/lib/page-extract";
import { parseFeedItems } from "@/lib/rss";
import { fetchSourceFeed, getBlockedSourceUrlError } from "@/lib/source-sync";
import { generateBriefsFromItems } from "@/lib/ai";
import { listConfiguredDeliveryChannels } from "@/lib/delivery";
import { queueBriefDelivery } from "@/lib/inngest";
import { extractStructuredList } from "@/lib/structured-extract";
import { fetchTelegramBotFeed } from "@/lib/telegram-bot-ingest";
import { extractTelegramPublicFeed } from "@/lib/telegram-extract";
import { extractUpdateEntries } from "@/lib/update-extract";
import { extractNewsletterArchiveEntries } from "@/lib/newsletter-archive-extract";
import { enrichItemCandidate } from "@/lib/item-enrichment";
import { analyzeItemQuality } from "@/lib/item-quality";
import {
  buildRadarSourceConfig,
  discoverRadarCandidates,
} from "@/lib/radar-discovery";
import {
  buildHotlistSourceConfig,
  discoverHotlistCandidates,
} from "@/lib/hotlist-discovery";
import {
  briefExistsForItem,
  createBriefRecord,
  createItemRecordResult,
  createSyncRun,
  finishSyncRun,
  getSourceById,
  getTopicById,
  getTelegramSourceSettings,
  listSources,
  markSourceSyncResult,
  type SourceRecord,
  type SourceType,
  type Store,
} from "@/lib/store";

const SOURCE_SYNC_TIMEOUT_MS = 10_000;

export type SyncSourceResult =
  | {
      ok: true;
      insertedItemCount: number;
      createdBriefCount: number;
      source: SourceRecord;
    }
  | {
      ok: false;
      error: string;
      source: SourceRecord | null;
    };

export type SourceCandidateInput = {
  title: string;
  url: string;
  sourceType: SourceType;
};

export type SubscriptionPreviewItem = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: string | null;
  sourceTitle: string;
  qualityStatus: "accepted" | "rejected" | "error";
  relevanceScore: number | null;
  relevanceReason: string | null;
  keywordMentioned: boolean | null;
  matchedTerms: string[];
  qualityError: string | null;
};

export type SubscriptionPreviewResult = {
  sourceCount: number;
  candidateItemCount: number;
  acceptedItemCount: number;
  rejectedItemCount: number;
  acceptedItems: SubscriptionPreviewItem[];
  rejectedItems: SubscriptionPreviewItem[];
  sourceErrors: Array<{ sourceTitle: string; error: string }>;
  recommendedSyncIntervalMinutes: number;
  recommendedNotificationLevel: "important" | "normal";
};

type SourceItemCandidate = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: string | null;
  rawContent?: string | null;
  structuredFields?: Record<string, unknown> | null;
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

function isDiscoverySourceType(sourceType: SourceType) {
  return (
    sourceType === "SEARCH_DISCOVERY" ||
    sourceType === "COMMUNITY_DISCOVERY" ||
    sourceType === "SOCIAL_DISCOVERY" ||
    sourceType === "HOTLIST_DISCOVERY"
  );
}

function isDiscoverySource(source: { sourceType: SourceType }) {
  return isDiscoverySourceType(source.sourceType);
}

function isHotlistSource(source: { sourceType: SourceType }) {
  return source.sourceType === "HOTLIST_DISCOVERY";
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

export async function storeSourceItemsAndCreateBriefs(
  store: Store,
  source: {
    id: string;
    topicId: string | null;
    sourceType?: SourceType;
    title?: string;
    url?: string;
    configJson?: Record<string, unknown> | null;
  },
  items: SourceItemCandidate[],
) {
  const topic = source.topicId ? await getTopicById(store, source.topicId) : null;

  const enrichedItems = await Promise.all(
    items.map((item) =>
      enrichItemCandidate({
        ...item,
        rawContent: item.summary,
      }),
    ),
  );

  const storedItems = await Promise.all(
    enrichedItems.map((item) => {
      const quality = topic
        ? analyzeItemQuality(topic, item)
        : {
            isReal: true,
            relevanceScore: null,
            relevanceReason: null,
            keywordMentioned: null,
            matchedTerms: [],
            qualityStatus: "accepted" as const,
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
          };

      return createItemRecordResult(store, {
        sourceId: source.id,
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        summary: item.summary,
        rawContent: item.rawContent,
        origin: item.origin,
        language: item.language,
        contentHash: item.contentHash,
        structuredFields: item.structuredFields,
        isReal: quality.isReal,
        relevanceScore: quality.relevanceScore,
        relevanceReason: quality.relevanceReason,
        keywordMentioned: quality.keywordMentioned,
        matchedTerms: quality.matchedTerms,
        qualityStatus: quality.qualityStatus,
        qualityError: quality.qualityError,
        viewCount: quality.viewCount,
        likeCount: quality.likeCount,
        commentCount: quality.commentCount,
        shareCount: quality.shareCount,
        replyCount: quality.replyCount,
        repostCount: quality.repostCount,
        sourceNativeScore: quality.sourceNativeScore,
        authorName: quality.authorName,
        authorUsername: quality.authorUsername,
        authorFollowers: quality.authorFollowers,
        authorVerified: quality.authorVerified,
        publishedAt: item.publishedAt,
        fetchedAt: item.fetchedAt,
      });
    }),
  );
  const insertedItems = storedItems.filter((item) => item !== null);
  const acceptedItems = insertedItems.filter(
    (item) => item.qualityStatus === "accepted",
  );
  const unbriefedPairs = await Promise.all(
    acceptedItems.map(async (item) => ({
      item,
      exists: await briefExistsForItem(store, item.id),
    })),
  );
  const unbriefedItems = unbriefedPairs
    .filter((pair) => !pair.exists)
    .map((pair) => pair.item);

  if (!topic || !source.topicId || unbriefedItems.length === 0) {
    return {
      insertedItemCount: insertedItems.length,
      createdBriefCount: 0,
    };
  }

  const briefs = await generateBriefsFromItems(topic, unbriefedItems);
  const hasDeliveryChannel = (await listConfiguredDeliveryChannels(store)).some(
    (channel) => channel.enabled,
  );

  for (const brief of briefs) {
    const briefId = await createBriefRecord(store, {
      topicId: source.topicId,
      itemIds: brief.itemIds,
      title: brief.title,
      summary: brief.summary,
      whyItMatters: brief.whyItMatters,
      sourceCitations: brief.sourceCitations,
      relevanceScore: brief.relevanceScore,
      importanceScore: brief.importanceScore,
      tags: brief.tags,
    });

    if (hasDeliveryChannel) {
      try {
        await queueBriefDelivery(briefId, {
          requestKey: briefId,
        });
      } catch (error) {
        console.error(`Failed to queue delivery for brief ${briefId}:`, error);
      }
    }
  }

  return {
    insertedItemCount: insertedItems.length,
    createdBriefCount: briefs.length,
  };
}

async function syncRssSource(
  source: SourceRecord,
  fetchImpl: typeof fetchSourceFeed,
) {
  const xml = await fetchImpl(source.url, {
    signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
  });
  const items = parseFeedItems(xml);

  if (items.length === 0) {
    throw new Error("Feed returned no supported items.");
  }

  return items;
}

async function syncPageSource(
  source: SourceRecord,
  fetchImpl: typeof fetchSourceFeed,
) {
  const html = await fetchImpl(source.url, {
    signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
  });
  const page = extractPageContent(html, source.url);

  return [
    {
      title: page.title,
      canonicalUrl: page.canonicalUrl,
      summary: page.summary,
      publishedAt: new Date().toISOString(),
    },
  ];
}

async function syncStructuredSource(
  source: SourceRecord,
  fetchImpl: typeof fetchSourceFeed,
) {
  const html = await fetchImpl(source.url, {
    signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
  });
  return await extractStructuredList(html, source.url);
}

async function syncUpdateSource(
  source: SourceRecord,
  fetchImpl: typeof fetchSourceFeed,
) {
  const html = await fetchImpl(source.url, {
    signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
  });
  return extractUpdateEntries(html, source.url);
}

async function syncNewsletterSource(
  source: SourceRecord,
  fetchImpl: typeof fetchSourceFeed,
) {
  const html = await fetchImpl(source.url, {
    signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
  });
  return await extractNewsletterArchiveEntries(html, source.url);
}

async function syncTelegramPublicSource(
  source: SourceRecord,
  fetchImpl: typeof fetchSourceFeed,
) {
  const html = await fetchImpl(source.url, {
    signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
  });
  return extractTelegramPublicFeed(html, source.url);
}

async function syncTelegramBotSource(
  store: Store,
  source: SourceRecord,
  fetchImpl?: typeof fetch,
) {
  const settings = await getTelegramSourceSettings(store);

  if (!settings.botToken) {
    throw new Error(
      "Telegram source bot token is not configured. Save it in Settings before syncing bot-backed Telegram sources.",
    );
  }

  return fetchTelegramBotFeed({
    botToken: settings.botToken,
    sourceUrl: source.url,
    fetchImpl,
  });
}

async function syncDiscoverySource(
  store: Store,
  source: SourceRecord,
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
    fetchImpl?: typeof fetch;
  },
) {
  if (!source.topicId) {
    throw new Error("Discovery sources require an exploration context.");
  }

  const topic = await getTopicById(store, source.topicId);

  if (!topic) {
    throw new Error(`Topic with ID ${source.topicId} not found.`);
  }

  const result = await discoverRadarCandidates(topic, source, options);

  if (result.candidates.length === 0 && result.failures.length > 0) {
    throw new Error(
      result.failures.map((failure) => `${failure.provider}: ${failure.error}`).join("; "),
    );
  }

  return result.candidates;
}

async function syncHotlistSource(
  store: Store,
  source: SourceRecord,
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
  },
) {
  if (!source.topicId) {
    throw new Error("Hotlist sources require an exploration context.");
  }

  const topic = await getTopicById(store, source.topicId);

  if (!topic) {
    throw new Error(`Topic with ID ${source.topicId} not found.`);
  }

  const result = await discoverHotlistCandidates(topic, source, options);

  if (result.candidates.length === 0 && result.failures.length > 0) {
    throw new Error(
      result.failures.map((failure) => `${failure.provider}: ${failure.error}`).join("; "),
    );
  }

  return result.candidates;
}

async function previewCandidateItems(
  store: Store,
  topicId: string,
  source: SourceCandidateInput,
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
    fetchImpl?: typeof fetch;
  },
): Promise<{
  items: SubscriptionPreviewItem[];
  errors: Array<{ sourceTitle: string; error: string }>;
}> {
  const topic = await getTopicById(store, topicId);
  if (!topic) {
    throw new Error(`Topic with ID ${topicId} not found.`);
  }

  const fetchImpl = options?.fetchSourceFeedImpl ?? fetchSourceFeed;
  const sourceRecord: SourceRecord = {
    id: "preview",
    ownerId: topic.ownerId,
    topicId,
    categoryId: "all",
    categories: ["all"],
    tags: [],
    title: source.title,
    url: source.url,
    sourceType: source.sourceType,
    configJson: isDiscoverySourceType(source.sourceType)
      ? isHotlistSource(source)
        ? buildHotlistSourceConfig(topic)
        : buildRadarSourceConfig(topic, source.sourceType)
      : null,
    status: "idle",
    lastSyncedAt: null,
    lastError: null,
    syncIntervalMinutes: 360,
    nextSyncAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const rawItems: SourceItemCandidate[] = isDiscoverySource(sourceRecord)
      ? isHotlistSource(sourceRecord)
        ? await syncHotlistSource(store, sourceRecord, {
            fetchSourceFeedImpl: fetchImpl,
          })
        : await syncDiscoverySource(store, sourceRecord, {
            fetchSourceFeedImpl: fetchImpl,
            fetchImpl: options?.fetchImpl,
          })
      : source.sourceType === "PAGE"
      ? await syncPageSource(sourceRecord, fetchImpl)
      : source.sourceType === "STRUCTURED"
      ? await syncStructuredSource(sourceRecord, fetchImpl)
      : source.sourceType === "UPDATE"
      ? await syncUpdateSource(sourceRecord, fetchImpl)
      : source.sourceType === "NEWSLETTER"
      ? await syncNewsletterSource(sourceRecord, fetchImpl)
      : source.sourceType === "TELEGRAM_PUBLIC"
      ? await syncTelegramPublicSource(sourceRecord, fetchImpl)
      : source.sourceType === "TELEGRAM_BOT"
      ? []
      : await syncRssSource(sourceRecord, fetchImpl);

    const enrichedItems = await Promise.all(
      rawItems.slice(0, 12).map((item) =>
        enrichItemCandidate({
          ...item,
          rawContent: item.rawContent ?? item.summary,
          structuredFields: item.structuredFields,
        }),
      ),
    );

    return {
      items: enrichedItems.map((item) => {
        const quality = analyzeItemQuality(topic, item);

        return {
          title: item.title,
          canonicalUrl: item.canonicalUrl,
          summary: item.summary,
          publishedAt: item.publishedAt,
          sourceTitle: source.title,
          qualityStatus:
            quality.qualityStatus === "pending" ? "error" : quality.qualityStatus,
          relevanceScore: quality.relevanceScore,
          relevanceReason: quality.relevanceReason,
          keywordMentioned: quality.keywordMentioned,
          matchedTerms: quality.matchedTerms,
          qualityError: quality.qualityError,
        };
      }),
      errors: [],
    };
  } catch (error) {
    return {
      items: [],
      errors: [
        {
          sourceTitle: source.title,
          error: getSyncErrorMessage(error),
        },
      ],
    };
  }
}

export async function previewSubscriptionSources(
  store: Store,
  topicId: string,
  sources: SourceCandidateInput[],
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
    fetchImpl?: typeof fetch;
  },
): Promise<SubscriptionPreviewResult> {
  const previews = await Promise.all(
    sources.map((source) => previewCandidateItems(store, topicId, source, options)),
  );
  const items = previews.flatMap((preview) => preview.items);
  const acceptedItems = items.filter((item) => item.qualityStatus === "accepted");
  const rejectedItems = items.filter((item) => item.qualityStatus !== "accepted");

  return {
    sourceCount: sources.length,
    candidateItemCount: items.length,
    acceptedItemCount: acceptedItems.length,
    rejectedItemCount: rejectedItems.length,
    acceptedItems,
    rejectedItems,
    sourceErrors: previews.flatMap((preview) => preview.errors),
    recommendedSyncIntervalMinutes: acceptedItems.length > 6 ? 120 : 360,
    recommendedNotificationLevel:
      acceptedItems.some((item) => (item.relevanceScore ?? 0) >= 0.75)
        ? "important"
        : "normal",
  };
}

export async function syncSourceById(
  store: Store,
  sourceId: string,
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
    telegramApiFetchImpl?: typeof fetch;
  },
): Promise<SyncSourceResult> {
  const source = await getSourceById(store, sourceId);

  if (!source) {
    return {
      ok: false,
      error: "Source not found.",
      source: null,
    };
  }

  const runId = await createSyncRun(store, { sourceId: source.id });

  const blockedSourceError = isDiscoverySource(source)
    ? null
    : getBlockedSourceUrlError(source.url);

  if (blockedSourceError) {
    await markSourceSyncResult(store, {
      sourceId: source.id,
      status: "error",
      error: blockedSourceError,
    });
    await finishSyncRun(store, {
      runId,
      status: "error",
      error: blockedSourceError,
    });

    return {
      ok: false,
      error: blockedSourceError,
      source,
    };
  }

  try {
    const fetchImpl = options?.fetchSourceFeedImpl ?? fetchSourceFeed;

    const items =
      source.sourceType === "PAGE"
        ? await syncPageSource(source, fetchImpl)
        : source.sourceType === "STRUCTURED"
        ? await syncStructuredSource(source, fetchImpl)
        : source.sourceType === "UPDATE"
        ? await syncUpdateSource(source, fetchImpl)
        : source.sourceType === "NEWSLETTER"
        ? await syncNewsletterSource(source, fetchImpl)
        : source.sourceType === "TELEGRAM_PUBLIC"
        ? await syncTelegramPublicSource(source, fetchImpl)
        : source.sourceType === "TELEGRAM_BOT"
        ? await syncTelegramBotSource(store, source, options?.telegramApiFetchImpl)
        : isHotlistSource(source)
        ? await syncHotlistSource(store, source, {
            fetchSourceFeedImpl: fetchImpl,
          })
        : isDiscoverySource(source)
        ? await syncDiscoverySource(store, source, {
            fetchSourceFeedImpl: fetchImpl,
            fetchImpl: options?.telegramApiFetchImpl,
          })
        : await syncRssSource(source, fetchImpl);

    const summary = await storeSourceItemsAndCreateBriefs(store, source, items);

    await markSourceSyncResult(store, {
      sourceId: source.id,
      status: "success",
    });
    await finishSyncRun(store, {
      runId,
      status: "success",
      insertedItemCount: summary.insertedItemCount,
      createdBriefCount: summary.createdBriefCount,
    });

    return {
      ok: true,
      source,
      ...summary,
    };
  } catch (error) {
    const syncError = getSyncErrorMessage(error);

    await markSourceSyncResult(store, {
      sourceId: source.id,
      status: "error",
      error: syncError,
    });
    await finishSyncRun(store, {
      runId,
      status: "error",
      error: syncError,
    });

    return {
      ok: false,
      error: syncError,
      source,
    };
  }
}

export type SyncAllResult = {
  synced: number;
  failed: number;
  skipped: number;
  results: SyncSourceResult[];
};

export async function syncAllSources(
  store: Store,
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
    telegramApiFetchImpl?: typeof fetch;
  },
): Promise<SyncAllResult> {
  const sources = await listSources(store);
  const results: SyncSourceResult[] = [];

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const source of sources) {
    // Skip sources that previously errored — user should fix and retry manually
    if (source.status === "error") {
      skipped++;
      continue;
    }

    const result = await syncSourceById(store, source.id, options);
    results.push(result);

    if (result.ok) {
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed, skipped, results };
}
