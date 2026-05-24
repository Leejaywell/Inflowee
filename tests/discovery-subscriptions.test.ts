/// <reference types="vitest/globals" />

import { createDiscoverySourcesForTopic } from "@/lib/discovery-subscriptions";
import {
  createSourceRecord,
  createTopicRecord,
  listSourcesByTopic,
  saveTopicProfile,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("discovery source subscriptions", () => {
  it("creates normal Source records from selected discovery candidates", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        topicType: "TOPIC",
        userPrompt: "Monitor AI coding tools.",
      });
      await saveTopicProfile(fixture.store, topicId, {
        keywords: ["OpenAI"],
        suggestedQueries: ["OpenAI coding agent"],
      });

      const result = await createDiscoverySourcesForTopic(fixture.store, topicId, [
        {
          id: "candidate-1",
          title: "OpenAI Blog",
          description: "Official updates.",
          url: "https://openai.com/blog/rss.xml",
          sourceType: "RSS",
          categoryIds: ["all", "technology"],
          tagIds: ["official", "ai"],
          origin: "preset",
          trendLabels: [],
        },
      ]);

      expect(result.createdSourceIds).toHaveLength(1);
      expect(await listSourcesByTopic(fixture.store, topicId)).toContainEqual(
        expect.objectContaining({
          title: "OpenAI Blog",
          url: "https://openai.com/blog/rss.xml",
          sourceType: "RSS",
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("skips duplicate and invalid candidates", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        topicType: "TOPIC",
        userPrompt: "Monitor AI coding tools.",
      });
      await createSourceRecord(fixture.store, {
        topicId,
        title: "OpenAI Blog",
        url: "https://openai.com/blog/rss.xml",
        sourceType: "RSS",
      });

      const result = await createDiscoverySourcesForTopic(fixture.store, topicId, [
        {
          id: "duplicate",
          title: "OpenAI Blog",
          description: "Official updates.",
          url: "https://openai.com/blog/rss.xml",
          sourceType: "RSS",
          categoryIds: ["all", "technology"],
          tagIds: ["official", "ai"],
          origin: "preset",
          trendLabels: [],
        },
        {
          id: "invalid",
          title: "x",
          description: "Invalid.",
          url: "not-a-url",
          sourceType: "RSS",
          categoryIds: ["all"],
          tagIds: [],
          origin: "preset",
          trendLabels: [],
        },
      ]);

      expect(result.createdSourceIds).toHaveLength(0);
      expect(result.skippedCandidateIds).toEqual(["duplicate", "invalid"]);
      expect(await listSourcesByTopic(fixture.store, topicId)).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps separate discovery sources when their provider config differs", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        topicType: "TOPIC",
        userPrompt: "Monitor AI coding tools.",
      });
      await createSourceRecord(fixture.store, {
        topicId,
        title: "AI search",
        url: "radar://search-discovery",
        sourceType: "SEARCH_DISCOVERY",
        configJson: {
          providers: ["bing"],
          queries: ["AI tools"],
          freshnessDays: 7,
          providerQuota: 10,
          totalQuota: 30,
        },
      });

      const result = await createDiscoverySourcesForTopic(fixture.store, topicId, [
        {
          id: "different-query",
          title: "Agent search",
          description: "Different radar query.",
          url: "radar://search-discovery",
          sourceType: "SEARCH_DISCOVERY",
          categoryIds: ["all", "technology"],
          tagIds: ["search"],
          origin: "discovery",
          trendLabels: [],
          configJson: {
            providers: ["bing"],
            queries: ["coding agents"],
            freshnessDays: 7,
            providerQuota: 10,
            totalQuota: 30,
          },
        },
      ]);

      expect(result.createdSourceIds).toHaveLength(1);
      expect(await listSourcesByTopic(fixture.store, topicId)).toHaveLength(2);
    } finally {
      fixture.cleanup();
    }
  });
});
