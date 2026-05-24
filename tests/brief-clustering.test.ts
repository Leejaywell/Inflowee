/// <reference types="vitest/globals" />

import { clusterItemsForBriefs } from "@/lib/brief-clustering";
import type { ItemRecord } from "@/lib/store";
import { makeItemRecord } from "./helpers/records";

function makeItem(id: string, title: string, canonicalUrl: string): ItemRecord {
  return makeItemRecord({
    id,
    title,
    canonicalUrl,
    summary: null,
    rawContent: title,
    contentHash: `hash-${id}`,
  });
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
