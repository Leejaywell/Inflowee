import { extractPageContent } from "@/lib/page-extract";
import { parseFeedItems } from "@/lib/rss";
import { fetchSourceFeed, getBlockedSourceUrlError } from "@/lib/source-sync";
import { generateBriefsFromItems } from "@/lib/ai";
import { queueBriefDelivery } from "@/lib/inngest";
import { extractStructuredList } from "@/lib/structured-extract";
import { fetchTelegramBotFeed } from "@/lib/telegram-bot-ingest";
import { extractTelegramPublicFeed } from "@/lib/telegram-extract";
import { extractUpdateEntries } from "@/lib/update-extract";
import { extractNewsletterArchiveEntries } from "@/lib/newsletter-archive-extract";
import { enrichItemCandidate } from "@/lib/item-enrichment";
import {
  briefExistsForItem,
  createBriefRecord,
  createItemRecordResult,
  createSyncRun,
  finishSyncRun,
  getFeishuSettings,
  getSlackSettings,
  getSourceById,
  getTelegramSourceSettings,
  getTelegramSettings,
  getTaskById,
  getWebhookSettings,
  listSources,
  markSourceSyncResult,
  type SourceRecord,
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
    taskId: string;
  },
  items: Array<{
    title: string;
    canonicalUrl: string;
    summary: string | null;
    publishedAt: string | null;
  }>,
) {
  const enrichedItems = await Promise.all(
    items.map((item) =>
      enrichItemCandidate({
        ...item,
        rawContent: item.summary,
      }),
    ),
  );

  const storedItems = await Promise.all(
    enrichedItems.map((item) =>
      createItemRecordResult(store, {
        sourceId: source.id,
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        summary: item.summary,
        rawContent: item.rawContent,
        origin: item.origin,
        language: item.language,
        contentHash: item.contentHash,
        structuredFields: item.structuredFields,
        publishedAt: item.publishedAt,
        fetchedAt: item.fetchedAt,
      }),
    ),
  );
  const insertedItems = storedItems.filter((item) => item !== null);
  const unbriefedPairs = await Promise.all(
    insertedItems.map(async (item) => ({
      item,
      exists: await briefExistsForItem(store, item.id),
    })),
  );
  const unbriefedItems = unbriefedPairs
    .filter((pair) => !pair.exists)
    .map((pair) => pair.item);

  if (unbriefedItems.length === 0) {
    return {
      insertedItemCount: insertedItems.length,
      createdBriefCount: 0,
    };
  }

  const task = await getTaskById(store, source.taskId);
  if (!task) {
    throw new Error(`Task with ID ${source.taskId} not found.`);
  }

  const briefs = await generateBriefsFromItems(task, unbriefedItems);
  const [webhookSettings, slackSettings, telegramSettings, feishuSettings] = await Promise.all([
    getWebhookSettings(store),
    getSlackSettings(store),
    getTelegramSettings(store),
    getFeishuSettings(store),
  ]);

  for (const brief of briefs) {
    const briefId = await createBriefRecord(store, {
      taskId: source.taskId,
      itemIds: brief.itemIds,
      title: brief.title,
      summary: brief.summary,
      whyItMatters: brief.whyItMatters,
      sourceCitations: brief.sourceCitations,
      relevanceScore: brief.relevanceScore,
      importanceScore: brief.importanceScore,
      tags: brief.tags,
    });

    if (
      webhookSettings.endpoint ||
      slackSettings.endpoint ||
      (telegramSettings.botToken && telegramSettings.chatId) ||
      feishuSettings.endpoint
    ) {
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

  const blockedSourceError = getBlockedSourceUrlError(source.url);

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
