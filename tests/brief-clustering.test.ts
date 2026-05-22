/// <reference types="vitest/globals" />

import { clusterItemsForBriefs } from "@/lib/brief-clustering";
import type { ItemRecord } from "@/lib/store";

function makeItem(id: string, title: string, canonicalUrl: string): ItemRecord {
  return {
    id,
    sourceId: "source-1",
    title,
    canonicalUrl,
    summary: null,
    rawContent: title,
    origin: "example.com",
    language: "en",
    contentHash: `hash-${id}`,
    structuredFields: null,
    publishedAt: "2026-05-22T00:00:00.000Z",
    fetchedAt: "2026-05-22T00:00:00.000Z",
    createdAt: "2026-05-22T00:00:00.000Z",
  };
}

describe("clusterItemsForBriefs", () => {
  it("clusters similar items under one brief candidate", () => {
    const clusters = clusterItemsForBriefs([
      makeItem("1", "OpenAI updates Responses API", "https://a.example/openai"),
      makeItem("2", "Responses API gets new tools", "https://b.example/openai"),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.itemIds).toEqual(["1", "2"]);
  });

  it("clusters same-event titles from multiple sources into one brief", () => {
    const clusters = clusterItemsForBriefs([
      makeItem("1", "OpenAI ships o4-mini", "https://a.example/openai"),
      makeItem("2", "OpenAI releases o4 mini", "https://b.example/openai"),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.itemIds).toEqual(["1", "2"]);
  });
});
