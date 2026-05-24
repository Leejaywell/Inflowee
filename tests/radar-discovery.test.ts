/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from "vitest";

import {
  buildRadarSourceConfig,
  discoverRadarCandidates,
} from "@/lib/radar-discovery";
import type { SourceRecord, TopicRecord } from "@/lib/store";

const topic = {
  id: "topic-1",
  title: "AI coding tools",
  userPrompt: "Monitor AI coding tools",
  topicProfile: {
    suggestedQueries: ["AI coding agents"],
  },
} as TopicRecord;

describe("radar discovery", () => {
  it("expands community discovery beyond Hacker News", () => {
    const config = buildRadarSourceConfig(topic, "COMMUNITY_DISCOVERY");

    expect(config.providers).toEqual(["hacker-news", "reddit", "product-hunt"]);
  });

  it("routes social discovery through configured site-search providers", async () => {
    const source = {
      id: "source-1",
      sourceType: "SOCIAL_DISCOVERY",
      configJson: {
        providers: ["weibo", "bilibili"],
        queries: ["AI coding"],
        providerQuota: 2,
        totalQuota: 4,
      },
    } as Partial<SourceRecord> as SourceRecord;
    const fetchSourceFeedImpl = vi.fn(async (url: string) => {
      expect(url).toMatch(/bing\.com\/news\/search/);
      return `<?xml version="1.0" encoding="UTF-8" ?>
        <rss><channel>
          <item>
            <title>AI coding update</title>
            <link>https://example.com/post</link>
            <description>summary</description>
            <pubDate>Sat, 01 Jan 2026 00:00:00 GMT</pubDate>
          </item>
        </channel></rss>`;
    });

    const result = await discoverRadarCandidates(topic, source, {
      fetchSourceFeedImpl: fetchSourceFeedImpl as never,
    });

    expect(fetchSourceFeedImpl).toHaveBeenCalledTimes(2);
    expect(result.failures).toEqual([]);
    expect(result.candidates).toHaveLength(1);
  });

  it("maps Reddit search results into radar candidates", async () => {
    const source = {
      id: "source-1",
      sourceType: "COMMUNITY_DISCOVERY",
      configJson: {
        providers: ["reddit"],
        queries: ["AI coding"],
        providerQuota: 2,
        totalQuota: 2,
      },
    } as Partial<SourceRecord> as SourceRecord;
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          children: [
            {
              data: {
                title: "New AI coding workflow",
                permalink: "/r/programming/comments/1/test/",
                selftext: "Discussion body",
                created_utc: 1_767_132_000,
                score: 42,
                num_comments: 7,
                author: "dev",
                subreddit: "programming",
              },
            },
          ],
        },
      }),
    }));

    const result = await discoverRadarCandidates(topic, source, {
      fetchImpl: fetchImpl as never,
    });

    expect(result.failures).toEqual([]);
    expect(result.candidates[0]).toMatchObject({
      title: "New AI coding workflow",
      canonicalUrl: "https://www.reddit.com/r/programming/comments/1/test/",
      commentCount: 7,
      sourceNativeScore: 42,
      authorUsername: "dev",
    });
  });
});
