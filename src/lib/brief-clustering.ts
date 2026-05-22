import type { ItemRecord } from "@/lib/store";

export type BriefCluster = {
  itemIds: string[];
  representativeTitle: string;
  citations: string[];
  items: ItemRecord[];
};

function tokenize(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function jaccardSimilarity(left: string, right: string) {
  const leftWords = tokenize(left);
  const rightWords = tokenize(right);

  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;

  return intersection / union;
}

export function clusterItemsForBriefs(items: ItemRecord[]): BriefCluster[] {
  const clusters: ItemRecord[][] = [];
  const visited = new Set<string>();

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (visited.has(item.id)) {
      continue;
    }

    const cluster = [item];
    visited.add(item.id);

    for (let cursor = index + 1; cursor < items.length; cursor++) {
      const candidate = items[cursor];
      if (visited.has(candidate.id)) {
        continue;
      }

      if (jaccardSimilarity(item.title, candidate.title) >= 0.25) {
        cluster.push(candidate);
        visited.add(candidate.id);
      }
    }

    clusters.push(cluster);
  }

  return clusters.map((cluster) => ({
    itemIds: cluster.map((item) => item.id),
    representativeTitle: cluster[0]?.title ?? "Untitled cluster",
    citations: [...new Set(cluster.map((item) => item.canonicalUrl))],
    items: cluster,
  }));
}
