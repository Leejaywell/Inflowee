/// <reference types="vitest/globals" />

import {
  buildGenericDiscoveryExperience,
  buildTopicDiscoveryExperience,
} from "@/lib/discovery-runtime";
import {
  createItemRecordResult,
  createSourceRecord,
  createTopicRecord,
  getTopicById,
  saveTopicProfile,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("topic discovery runtime", () => {
  it("builds a browsable generic discovery experience without a topic", () => {
    const experience = buildGenericDiscoveryExperience();

    expect(experience.categories.length).toBeGreaterThan(0);
    expect(experience.tags.length).toBeGreaterThan(0);
    expect(experience.candidates.length).toBeGreaterThan(0);
  });

  it("combines AI-planned tags, local subscription stats, and contextual radar candidates", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        topicType: "TOPIC",
        userPrompt: "Monitor AI coding tools.",
      });
      await saveTopicProfile(fixture.store, topicId, {
        keywords: ["Agent IDE"],
        suggestedQueries: ["Agent IDE funding"],
      });
      const sourceId = await createSourceRecord(fixture.store, {
        topicId,
        title: "OpenAI Blog",
        url: "https://openai.com/blog/rss.xml",
        sourceType: "RSS",
      });
      await createItemRecordResult(fixture.store, {
        sourceId,
        title: "Agent IDE update",
        canonicalUrl: "https://openai.com/blog/agent-ide",
        summary: "Agent IDE update",
        rawContent: "Agent IDE update",
        qualityStatus: "accepted",
        sourceNativeScore: 100,
      });

      const record = await getTopicById(fixture.store, topicId);
      expect(record).not.toBeNull();

      const experience = await buildTopicDiscoveryExperience(fixture.store, record!, {
        categoryId: "technology",
        selectedTagIds: ["ai"],
      });

      expect(experience.tags).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: "Agent IDE" })]),
      );
      expect(experience.candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "preset:openai-blog",
            subscriberCount: 1,
            recentSubscriberGrowth: 1,
          }),
          expect.objectContaining({
            sourceType: "SEARCH_DISCOVERY",
            configJson: expect.objectContaining({
              queries: expect.arrayContaining(["AI"]),
            }),
          }),
        ]),
      );
    } finally {
      fixture.cleanup();
    }
  });
});
