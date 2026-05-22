/// <reference types="vitest/globals" />

import { enrichItemCandidate } from "@/lib/item-enrichment";

describe("enrichItemCandidate", () => {
  it("normalizes raw item candidates into enriched items", async () => {
    const item = await enrichItemCandidate({
      title: "OpenAI adds Responses API updates",
      canonicalUrl: "https://example.com/post",
      summary: "Short summary",
      publishedAt: "2026-05-22T00:00:00.000Z",
      rawContent: "OpenAI shipped responses updates for agent developers.",
    });

    expect(item).toMatchObject({
      language: "en",
      origin: "example.com",
      summary: "Short summary",
      rawContent: "OpenAI shipped responses updates for agent developers.",
      fetchedAt: expect.any(String),
    });
    expect(item.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
