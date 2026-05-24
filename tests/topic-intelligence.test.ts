/// <reference types="vitest/globals" />

import { refreshTopicIntelligence } from "@/lib/topic-intelligence";
import {
  createTopicRecord,
  getTopicProfile,
  listRecommendationBundlesByTopic,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("topic intelligence for personal monitoring topicsLabel", () => {
  it("stores a topic profile and source bundles for a topic", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track coding agents",
        topicType: "TOPIC",
        userPrompt: "Monitor Devin and Cursor coding agent updates.",
      });

      await refreshTopicIntelligence(fixture.store, topicId, {
        understandTopicIntentImpl: vi.fn().mockResolvedValue({
          keywords: ["Devin", "Cursor", "coding agent"],
          suggestedQueries: ["Devin Cursor coding agent updates"],
        }),
        recommendSourceBundlesImpl: vi.fn().mockResolvedValue([
          {
            title: "Official sources",
            description: "Official blogs and changelogs.",
            rationale: "Direct announcements.",
            sources: [
              {
                title: "Cursor changelog",
                url: "https://cursor.com/changelog",
                sourceType: "PAGE",
              },
            ],
          },
          {
            title: "Search discovery",
            description: "Public search radar.",
            rationale: "Finds new mentions.",
            sources: [
              {
                title: "Coding agent search",
                url: "radar://search-discovery",
                sourceType: "SEARCH_DISCOVERY",
              },
            ],
          },
        ]),
      });

      expect(await getTopicProfile(fixture.store, topicId)).toEqual({
        keywords: ["Devin", "Cursor", "coding agent"],
        suggestedQueries: ["Devin Cursor coding agent updates"],
      });
      expect(await listRecommendationBundlesByTopic(fixture.store, topicId)).toEqual([
        expect.objectContaining({ title: "Official sources" }),
        expect.objectContaining({ title: "Search discovery" }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("throws for missing topics", async () => {
    const fixture = createSqliteFixture();

    try {
      await expect(refreshTopicIntelligence(fixture.store, "missing")).rejects.toThrow(
        "Topic missing not found.",
      );
    } finally {
      fixture.cleanup();
    }
  });
});
