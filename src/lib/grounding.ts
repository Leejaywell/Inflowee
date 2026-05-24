import {
  type BriefRecord,
  getBriefById,
  listBriefsFiltered,
  listItemsByBriefId,
  listItemsBySource,
  listSourcesByTopic,
  type ItemRecord,
  type Store,
} from "@/lib/store";

export type GroundingScopeType = "brief" | "topic";

export type GroundingResult = {
  briefs: BriefRecord[];
  items: ItemRecord[];
};

type GroundingOptions = {
  includeItems?: boolean;
  actorId?: string;
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
  scopeType: GroundingScopeType | "global",
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

  if (scopeType === "topic") {
    const briefs = await listBriefsFiltered(store, {
      topicId: scopeId,
      actorId: options.actorId,
    });
    const items = includeItems
      ? dedupeAndSortItems(
          (
            await Promise.all(
              (await listSourcesByTopic(store, scopeId)).map((source) =>
                listItemsBySource(store, source.id),
              ),
            )
          ).flat(),
        )
      : [];

    return { briefs, items };
  }

  if (scopeType === "global") {
    const briefs = await listBriefsFiltered(store, {
      actorId: options.actorId,
    });

    if (!includeItems) {
      return { briefs, items: [] };
    }

    const topicIds = [...new Set(briefs.map((brief) => brief.topicId))];
    const sourceGroups = await Promise.all(
      topicIds.map((topicId) => listSourcesByTopic(store, topicId)),
    );
    const items = (
      await Promise.all(
        sourceGroups.flat().map((source) => listItemsBySource(store, source.id)),
      )
    ).flat();

    return { briefs, items: dedupeAndSortItems(items) };
  }
  return { briefs: [], items: [] };
}
