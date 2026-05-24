import { planSubscriptionDiscovery } from "@/lib/ai";
import {
  getDiscoveryCategories,
  getDiscoverySourceCandidates,
  getDiscoveryTags,
  type DiscoveryCatalogContext,
  type DiscoveryCategory,
  type DiscoverySourceCandidate,
  type DiscoverySourceStats,
  type DiscoveryTag,
} from "@/lib/discovery-catalog";
import {
  listItemsBySource,
  listSources,
  type Store,
  type TaskRecord,
} from "@/lib/store";

export type DiscoveryExperience = {
  categories: DiscoveryCategory[];
  tags: DiscoveryTag[];
  candidates: DiscoverySourceCandidate[];
};

function normalizeUrlKey(value: string) {
  return value.trim().toLowerCase();
}

export async function buildDiscoverySourceStats(
  store: Store,
): Promise<DiscoverySourceStats> {
  const sources = await listSources(store);
  const subscriberCountByUrl = new Map<string, number>();
  const recentSubscriberGrowthByUrl = new Map<string, number>();
  const heatScoreByUrl = new Map<string, number>();
  const recentThreshold = Date.now() - 1000 * 60 * 60 * 24 * 7;

  for (const source of sources) {
    const urlKey = normalizeUrlKey(source.url);
    subscriberCountByUrl.set(urlKey, (subscriberCountByUrl.get(urlKey) ?? 0) + 1);
    if (new Date(source.createdAt).getTime() >= recentThreshold) {
      recentSubscriberGrowthByUrl.set(
        urlKey,
        (recentSubscriberGrowthByUrl.get(urlKey) ?? 0) + 1,
      );
    }

    const items = await listItemsBySource(store, source.id);
    const acceptedItems = items.filter((item) => item.qualityStatus === "accepted");
    const recentItems = items.filter((item) => {
      const publishedAt = item.publishedAt ?? item.createdAt;
      return Date.now() - new Date(publishedAt).getTime() <= 1000 * 60 * 60 * 24 * 14;
    });
    const nativeHeat = items.reduce((sum, item) => {
      return (
        sum +
        (item.sourceNativeScore ?? 0) +
        (item.viewCount ?? 0) * 0.001 +
        (item.likeCount ?? 0) * 0.01 +
        (item.commentCount ?? 0) * 0.05
      );
    }, 0);

    heatScoreByUrl.set(
      urlKey,
      Math.min(
        100,
        (heatScoreByUrl.get(urlKey) ?? 0) +
          acceptedItems.length * 3 +
          recentItems.length * 2 +
          Math.log10(nativeHeat + 1) * 8,
      ),
    );
  }

  return {
    subscriberCountByUrl,
    recentSubscriberGrowthByUrl,
    heatScoreByUrl,
  };
}

export async function buildTaskDiscoveryContext(
  store: Store,
  task: TaskRecord,
  options: {
    categoryId?: string;
    selectedTagIds?: string[];
    bypassAiCache?: boolean;
  } = {},
): Promise<DiscoveryCatalogContext> {
  const [stats, aiPlan] = await Promise.all([
    buildDiscoverySourceStats(store),
    planSubscriptionDiscovery({
      title: task.title,
      prompt: task.userPrompt,
      profile: task.taskProfile ?? null,
      bypassCache: options.bypassAiCache,
    }),
  ]);

  return {
    profile: task.taskProfile ?? null,
    aiPlan,
    stats,
    categoryId: options.categoryId,
    selectedTagIds: options.selectedTagIds,
  };
}

export async function buildTaskDiscoveryExperience(
  store: Store,
  task: TaskRecord,
  options: {
    categoryId?: string;
    selectedTagIds?: string[];
    bypassAiCache?: boolean;
  } = {},
): Promise<DiscoveryExperience> {
  const context = await buildTaskDiscoveryContext(store, task, options);
  const categories = getDiscoveryCategories(context.aiPlan);
  const tags = [
    ...new Map(
      categories
        .flatMap((category) => getDiscoveryTags(category.id, context))
        .map((tag) => [tag.id, tag] as const),
    ).values(),
  ];
  const candidateMap = new Map<string, DiscoverySourceCandidate>();

  for (const candidate of getDiscoverySourceCandidates(context)) {
    candidateMap.set(candidate.id, candidate);
  }

  for (const category of categories) {
    for (const tag of tags
      .filter((item) => item.categoryId === "all" || item.categoryId === category.id)
      .slice(0, 12)) {
      for (const candidate of getDiscoverySourceCandidates({
        ...context,
        categoryId: category.id,
        selectedTagIds: [tag.id],
      })) {
        candidateMap.set(candidate.id, candidate);
      }
    }
  }

  return {
    categories,
    tags,
    candidates: [...candidateMap.values()],
  };
}
