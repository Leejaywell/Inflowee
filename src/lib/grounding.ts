import {
  type BriefRecord,
  getBriefById,
  listTasksBySpace,
  listBriefsFiltered,
  listItemsByBriefId,
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
  includeItems?: boolean;
  fallbackSpaceId?: string;
  includeSiblingFallback?: boolean;
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

export async function getGroundingForScope(
  store: Store,
  scopeType: GroundingScopeType,
  scopeId: string,
  options: GroundingOptions = {},
): Promise<GroundingResult> {
  const includeItems = options.includeItems ?? true;

  if (scopeType === "brief") {
    const brief = await getBriefById(store, scopeId);
    if (!brief) {
      return { briefs: [], items: [] };
    }

    if (!includeItems) {
      return { briefs: [brief], items: [] };
    }

    const items = await listItemsByBriefId(store, scopeId);
    if (items.length === 0) {
      return { briefs: [brief], items: [] };
    }

    return {
      briefs: [brief],
      items: dedupeAndSortItems(items),
    };
  }

  if (scopeType === "task") {
    const briefs = await listBriefsFiltered(store, { taskId: scopeId });
    const items = includeItems
      ? dedupeAndSortItems(
          (
            await Promise.all(
              (await listSourcesByTask(store, scopeId)).map((source) =>
                listItemsBySource(store, source.id),
              ),
            )
          ).flat(),
        )
      : [];

    if (
      briefs.length === 0 &&
      items.length === 0 &&
      options.includeSiblingFallback &&
      options.fallbackSpaceId
    ) {
      return getGroundingForScope(store, "space", options.fallbackSpaceId, {
        includeItems,
      });
    }

    return { briefs, items };
  }

  const taskIds = (await listTasksBySpace(store, scopeId)).map((task) => task.id);

  if (taskIds.length === 0) {
    return { briefs: [], items: [] };
  }

  const taskIdSet = new Set(taskIds);
  const briefs = (await listBriefsFiltered(store)).filter((brief) =>
    taskIdSet.has(brief.taskId),
  );
  if (!includeItems) {
    return { briefs, items: [] };
  }

  const sourceGroups = await Promise.all(
    taskIds.map((taskId) => listSourcesByTask(store, taskId)),
  );
  const items = (
    await Promise.all(
      sourceGroups.flat().map((source) => listItemsBySource(store, source.id)),
    )
  ).flat();

  return { briefs, items: dedupeAndSortItems(items) };
}
