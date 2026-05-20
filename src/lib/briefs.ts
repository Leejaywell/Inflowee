import type { ItemRecord } from "@/lib/store";

export type BriefCandidate = {
  taskId: string;
  itemIds: string[];
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: string[];
};

export function buildBriefsFromItems(
  taskId: string,
  items: Pick<
    ItemRecord,
    "id" | "title" | "canonicalUrl" | "summary" | "publishedAt"
  >[],
): BriefCandidate[] {
  return items.map((item) => ({
    taskId,
    itemIds: [item.id],
    title: item.title,
    summary: item.summary ?? "No summary available.",
    whyItMatters: "New signal captured from subscribed RSS sources.",
    sourceCitations: [item.canonicalUrl],
  }));
}
