/// <reference types="vitest/globals" />

import {
  buildContextualDiscoveryCandidates,
  filterDiscoverySourceCandidates,
  getDiscoveryCategories,
  getDiscoverySourceCandidates,
  getDiscoveryTagBatch,
  getDiscoveryTags,
  mapSourcePresetsToDiscoveryCandidates,
} from "@/lib/discovery-catalog";

describe("category tag subscription discovery catalog", () => {
  it("keeps category and tag ids unique", () => {
    const categories = getDiscoveryCategories();
    const tags = [
      ...new Map(
        categories
          .flatMap((category) => getDiscoveryTags(category.id, null))
          .map((tag) => [tag.id, tag] as const),
      ).values(),
    ];

    expect(new Set(categories.map((category) => category.id)).size).toBe(
      categories.length,
    );
    expect(new Set(tags.map((tag) => tag.id)).size).toBe(tags.length);
  });

  it("returns default tags without AI context", () => {
    expect(getDiscoveryTags("technology", null)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "trend-hot" }),
        expect.objectContaining({ id: "ai" }),
      ]),
    );
  });

  it("can rotate visible tag batches without pagination state", () => {
    const tags = getDiscoveryTags("technology", {
      keywords: ["Devin", "coding agent", "AI IDE", "Claude Code"],
      suggestedQueries: [],
    });

    expect(getDiscoveryTagBatch(tags, 0, 4)).not.toEqual(
      getDiscoveryTagBatch(tags, 1, 4),
    );
  });

  it("maps source presets into discovery candidates", () => {
    const candidates = mapSourcePresetsToDiscoveryCandidates({
      keywords: ["OpenAI"],
      suggestedQueries: [],
    });

    expect(candidates).toContainEqual(
      expect.objectContaining({
        id: "preset:openai-blog",
        origin: "preset",
        categoryIds: expect.arrayContaining(["technology"]),
        tagIds: expect.arrayContaining(["ai"]),
      }),
    );
  });

  it("filters source candidates by category and selected tags", () => {
    const candidates = getDiscoverySourceCandidates({
      keywords: ["OpenAI"],
      suggestedQueries: ["OpenAI agent updates"],
    });

    const filtered = filterDiscoverySourceCandidates({
      candidates,
      categoryId: "technology",
      selectedTagIds: ["ai-recommended"],
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((candidate) => candidate.categoryIds.includes("technology"))).toBe(
      true,
    );
    expect(filtered.some((candidate) => candidate.origin === "discovery")).toBe(
      true,
    );
  });

  it("ranks task-relevant and high-trend sources first", () => {
    const candidates = getDiscoverySourceCandidates({
      keywords: ["OpenAI"],
      suggestedQueries: ["OpenAI product updates"],
    });

    expect(candidates[0]?.trendLabels).toEqual(
      expect.arrayContaining(["AI 推荐", "与目标相关"]),
    );
  });

  it("distinguishes preset, AI, and dynamic discovery candidate origins", () => {
    const origins = new Set(
      getDiscoverySourceCandidates({
        keywords: ["OpenAI"],
        suggestedQueries: ["OpenAI product updates"],
      }).map((candidate) => candidate.origin),
    );

    expect(origins).toEqual(new Set(["preset", "ai", "discovery"]));
  });

  it("builds real radar source candidates for selected tags", () => {
    const candidates = buildContextualDiscoveryCandidates({
      profile: {
        keywords: ["AI coding"],
        suggestedQueries: ["AI coding tools updates"],
      },
      categoryId: "technology",
      selectedTagIds: ["ai"],
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "SEARCH_DISCOVERY",
          url: "radar://search-discovery",
          configJson: expect.objectContaining({
            providers: expect.arrayContaining(["bing", "hacker-news", "reddit"]),
            queries: expect.arrayContaining(["AI"]),
          }),
        }),
      ]),
    );
  });
});
