import type { ItemRecord } from "@/lib/store";

export type BriefCluster = {
  itemIds: string[];
  representativeTitle: string;
  citations: string[];
  items: ItemRecord[];
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "over",
  "about",
  "new",
  "ships",
  "ship",
  "releases",
  "release",
  "launches",
  "launch",
  "announces",
  "announce",
  "introduces",
  "introduce",
  "update",
  "updates",
]);

function tokenize(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/-/g, " ")
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
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

function normalizedHeadline(text: string) {
  return [...tokenize(text)].sort().join(" ");
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

      if (
        candidate.canonicalUrl === item.canonicalUrl ||
        normalizedHeadline(item.title) === normalizedHeadline(candidate.title) ||
        jaccardSimilarity(item.title, candidate.title) >= 0.34
      ) {
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
