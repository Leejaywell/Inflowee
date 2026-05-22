import type { ItemRecord } from "@/lib/store";
import { clusterItemsForBriefs } from "@/lib/brief-clustering";

export type BriefCandidate = {
  taskId: string;
  itemIds: string[];
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: string[];
  relevanceScore: number;
  importanceScore: number;
  tags: string[];
};

export function buildBriefsFromItems(
  taskId: string,
  items: Pick<
    ItemRecord,
    "id" | "title" | "canonicalUrl" | "summary" | "publishedAt"
  >[],
): BriefCandidate[] {
  return clusterItemsForBriefs(items as ItemRecord[])
    .map((cluster) => {
      const lead = cluster.items[0];
      const summary =
        cluster.items.find((item) => item.summary)?.summary ??
        "No summary available.";
      const tags = Array.from(
        new Set(
          `${lead?.title ?? ""} ${summary}`.toLowerCase().match(/\b[a-z0-9-]{3,}\b/g) ?? [],
        ),
      ).filter((tag) =>
        ["openai", "agent", "api", "model", "funding", "launch"].includes(tag),
      );
      const sourceCount = cluster.items.length;

      return {
        taskId,
        itemIds: cluster.itemIds,
        title: cluster.representativeTitle,
        summary,
        whyItMatters:
          sourceCount > 1
            ? `Multiple sources are reporting the same event, which raises confidence in the signal.`
            : "New signal captured from subscribed RSS sources.",
        sourceCitations: cluster.citations,
        relevanceScore: Math.min(1, 0.5 + sourceCount * 0.1),
        importanceScore: Math.min(1, 0.45 + sourceCount * 0.15),
        tags,
      };
    })
    .sort(
      (left, right) =>
        right.importanceScore - left.importanceScore ||
        right.relevanceScore - left.relevanceScore,
    );
}
