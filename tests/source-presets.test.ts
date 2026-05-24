/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";

import { getSourcePresetById, sourcePresets } from "@/lib/source-presets";

describe("source presets", () => {
  it("includes domestic recruiting sources as structured job presets", () => {
    const domesticPresetIds = [
      "boss-zhipin",
      "zhilian-zhaopin",
      "51job",
      "liepin",
      "lagou",
      "maimai-jobs",
    ];

    for (const presetId of domesticPresetIds) {
      const preset = getSourcePresetById(presetId);

      expect(preset).toMatchObject({
        id: presetId,
        sourceType: "STRUCTURED",
        category: "jobs",
      });
      expect(preset?.url).toMatch(/^https:\/\//);
    }
  });

  it("keeps preset ids unique", () => {
    const ids = sourcePresets.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes all requested non-job preset groups", () => {
    const presetIds = sourcePresets.map((preset) => preset.id);

    expect(presetIds).toEqual(
      expect.arrayContaining([
        "openai-blog",
        "openai-changelog",
        "anthropic-news",
        "anthropic-release-notes",
        "google-deepmind-blog",
        "cursor-changelog",
        "github-blog",
        "github-changelog",
        "vercel-changelog",
        "supabase-blog",
        "supabase-changelog",
        "cloudflare-blog",
        "hacker-news-discovery",
        "product-hunt-discovery",
        "reddit-discovery",
        "github-trending",
        "lobsters",
        "dev-to",
        "juejin",
        "v2ex-tech",
        "oschina-news",
        "segmentfault-blogs",
        "csdn-blog",
        "infoq-cn-ai",
        "jiqizhixin",
        "qbitai",
        "36kr-tech",
        "bilibili-discovery",
        "weibo-discovery",
        "china-hotlist-discovery",
        "news-hotlist-discovery",
        "zhihu-search",
        "xiaohongshu-search",
        "linear-changelog",
        "notion-releases",
        "slack-changelog",
        "stripe-blog",
        "stripe-changelog",
        "shopify-engineering",
        "microsoft-devblogs",
        "aws-news-blog",
        "azure-updates",
        "google-cloud-blog",
      ]),
    );
  });

  it("passes provider config for discovery presets", () => {
    expect(getSourcePresetById("reddit-discovery")).toMatchObject({
      sourceType: "COMMUNITY_DISCOVERY",
      configJson: { providers: ["reddit"] },
    });
    expect(getSourcePresetById("bilibili-discovery")).toMatchObject({
      sourceType: "SOCIAL_DISCOVERY",
      configJson: { providers: ["bilibili"] },
    });
    expect(getSourcePresetById("china-hotlist-discovery")).toMatchObject({
      sourceType: "HOTLIST_DISCOVERY",
      category: "hotlist",
      configJson: { providers: ["baidu", "weibo", "zhihu", "bilibili"] },
    });
  });
});
