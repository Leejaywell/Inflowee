import { buildBriefsFromItems } from "@/lib/briefs";
import { extractPageContent } from "@/lib/page-extract";
import { parseFeedItems } from "@/lib/rss";
import { fetchSourceFeed, getBlockedSourceUrlError } from "@/lib/source-sync";
import {
  briefExistsForItem,
  createBriefRecord,
  createItemRecordResult,
  getSourceById,
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

export function storeSourceItemsAndCreateBriefs(
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
  const insertedItems = items.flatMap((item) => {
    const storedItem = createItemRecordResult(store, {
      sourceId: source.id,
      title: item.title,
      canonicalUrl: item.canonicalUrl,
      summary: item.summary,
      publishedAt: item.publishedAt,
    });

    return storedItem ? [storedItem] : [];
  });

  const unbriefedItems = insertedItems.filter(
    (item) => !briefExistsForItem(store, item.id),
  );

  const briefs = buildBriefsFromItems(source.taskId, unbriefedItems);

  for (const brief of briefs) {
    createBriefRecord(store, brief);
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

export async function syncSourceById(
  store: Store,
  sourceId: string,
  options?: {
    fetchSourceFeedImpl?: typeof fetchSourceFeed;
  },
): Promise<SyncSourceResult> {
  const source = getSourceById(store, sourceId);

  if (!source) {
    return {
      ok: false,
      error: "Source not found.",
      source: null,
    };
  }

  const blockedSourceError = getBlockedSourceUrlError(source.url);

  if (blockedSourceError) {
    markSourceSyncResult(store, {
      sourceId: source.id,
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
        : await syncRssSource(source, fetchImpl);

    const summary = storeSourceItemsAndCreateBriefs(store, source, items);

    markSourceSyncResult(store, {
      sourceId: source.id,
      status: "success",
    });

    return {
      ok: true,
      source,
      ...summary,
    };
  } catch (error) {
    const syncError = getSyncErrorMessage(error);

    markSourceSyncResult(store, {
      sourceId: source.id,
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
