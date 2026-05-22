import {
  type BriefRecord,
  getBriefById,
  listBriefItemIds,
  listBriefsFiltered,
  listItemsBySource,
  listSourcesByTask,
  type ItemRecord,
  type Store,
} from "@/lib/store";

export type GroundingScopeType = "brief" | "task" | "space";

export type GroundingResult = {
  briefs: BriefRecord[];
  items: ItemRecord[];
};

type GroundingOptions = {
  includeItems?: false;
};

function compareItemsByFreshness(a: ItemRecord, b: ItemRecord): number {
  const aPublishedTime = Date.parse(a.publishedAt ?? "");
  const bPublishedTime = Date.parse(b.publishedAt ?? "");
  const aHasValidPublishedTime = !Number.isNaN(aPublishedTime);
  const bHasValidPublishedTime = !Number.isNaN(bPublishedTime);

  if (aHasValidPublishedTime && bHasValidPublishedTime) {
    const publishedDiff = bPublishedTime - aPublishedTime;
    if (publishedDiff !== 0) {
      return publishedDiff;
    }
  }

  if (aHasValidPublishedTime !== bHasValidPublishedTime) {
    return aHasValidPublishedTime ? -1 : 1;
  }

  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function dedupeAndSortItems(items: ItemRecord[]): ItemRecord[] {
  const deduped = new Map<string, ItemRecord>();

  for (const item of items) {
    const existing = deduped.get(item.canonicalUrl);
    if (!existing || compareItemsByFreshness(item, existing) < 0) {
      deduped.set(item.canonicalUrl, item);
    }
  }

  return [...deduped.values()].sort(compareItemsByFreshness);
}

export function getGroundingForScope(
  store: Store,
  scopeType: GroundingScopeType,
  scopeId: string,
  options: GroundingOptions = {},
): GroundingResult {
  const includeItems = options.includeItems ?? true;

  if (scopeType === "brief") {
    const brief = getBriefById(store, scopeId);
    if (!brief) {
      return { briefs: [], items: [] };
    }

    if (!includeItems) {
      return { briefs: [brief], items: [] };
    }

    const itemIds = listBriefItemIds(store, scopeId);
    if (itemIds.length === 0) {
      return { briefs: [brief], items: [] };
    }

    const placeholders = itemIds.map(() => "?").join(",");
    const items = store.database
      .prepare(
        `SELECT * FROM items
         WHERE id IN (${placeholders})
         ORDER BY published_at DESC, created_at DESC`,
      )
      .all(...itemIds) as Array<{
      id: string;
      source_id: string;
      title: string;
      canonical_url: string;
      summary: string | null;
      raw_content: string | null;
      origin: string | null;
      language: string | null;
      content_hash: string;
      structured_fields: string | null;
      published_at: string | null;
      fetched_at: string;
      created_at: string;
    }>;

    return {
      briefs: [brief],
      items: items.map((row) => ({
        id: row.id,
        sourceId: row.source_id,
        title: row.title,
        canonicalUrl: row.canonical_url,
        summary: row.summary,
        rawContent: row.raw_content,
        origin: row.origin,
        language: row.language,
        contentHash: row.content_hash,
        structuredFields: row.structured_fields
          ? (JSON.parse(row.structured_fields) as Record<string, unknown>)
          : null,
        publishedAt: row.published_at,
        fetchedAt: row.fetched_at,
        createdAt: row.created_at,
      })),
    };
  }

  if (scopeType === "task") {
    const briefs = listBriefsFiltered(store, { taskId: scopeId });
    if (!includeItems) {
      return { briefs, items: [] };
    }

    const items = dedupeAndSortItems(
      listSourcesByTask(store, scopeId).flatMap((source) =>
        listItemsBySource(store, source.id),
      ),
    );

    return { briefs, items };
  }

  const taskIds = (
    store.database
      .prepare("SELECT id FROM tasks WHERE space_id = ? ORDER BY created_at DESC")
      .all(scopeId) as Array<{ id: string }>
  ).map((task) => task.id);

  if (taskIds.length === 0) {
    return { briefs: [], items: [] };
  }

  const taskIdSet = new Set(taskIds);
  const briefs = listBriefsFiltered(store).filter((brief) =>
    taskIdSet.has(brief.taskId),
  );
  if (!includeItems) {
    return { briefs, items: [] };
  }

  const items = taskIds.flatMap((taskId) =>
    listSourcesByTask(store, taskId).flatMap((source) =>
      listItemsBySource(store, source.id),
    ),
  );

  return { briefs, items: dedupeAndSortItems(items) };
}
