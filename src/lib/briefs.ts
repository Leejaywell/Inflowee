import type { ItemRecord } from "@/lib/store";
import { clusterItemsForBriefs } from "@/lib/brief-clustering";
import { deriveTopicTags } from "@/lib/topic-tags";

export type BriefCandidate = {
  topicId: string;
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
  topicId: string,
  items: Pick<
    ItemRecord,
    "id" | "title" | "canonicalUrl" | "summary" | "publishedAt"
  >[],
): BriefCandidate[] {
  return clusterItemsForBriefs(items as ItemRecord[])
    .map((cluster) => {
      const summary =
        cluster.items.find((item) => item.summary)?.summary ??
        "No summary available.";
      const tags = deriveTopicTags({
        items: cluster.items,
        title: cluster.representativeTitle,
        summary,
      });
      const sourceCount = cluster.items.length;

      return {
        topicId,
        itemIds: cluster.itemIds,
        title: cluster.representativeTitle,
        summary,
        whyItMatters:
          sourceCount > 1
            ? `Multiple sources are reporting the same event, which raises confidence in the signal.`
            : "New signal captured from subscribed RSS sources.",
        sourceCitations: cluster.citations,
        relevanceScore: Math.min(1, 0.5 + sourceCount * 0.1),
        importanceScore: Math.min(
          1,
          0.45 + sourceCount * 0.15 + Math.min(tags.length, 10) * 0.015,
        ),
        tags,
      };
    })
    .sort(
      (left, right) =>
        right.importanceScore - left.importanceScore ||
        right.relevanceScore - left.relevanceScore,
    );
}
