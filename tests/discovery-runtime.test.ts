/// <reference types="vitest/globals" />

import { buildTaskDiscoveryExperience } from "@/lib/discovery-runtime";
import {
  createItemRecordResult,
  createSourceRecord,
  createTaskRecord,
  getTaskById,
  saveTaskProfile,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("task discovery runtime", () => {
  it("combines AI-planned tags, local subscription stats, and contextual radar candidates", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        taskType: "TOPIC",
        userPrompt: "Monitor AI coding tools.",
      });
      await saveTaskProfile(fixture.store, taskId, {
        keywords: ["Agent IDE"],
        suggestedQueries: ["Agent IDE funding"],
      });
      const sourceId = await createSourceRecord(fixture.store, {
        taskId,
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

      const record = await getTaskById(fixture.store, taskId);
      expect(record).not.toBeNull();

      const experience = await buildTaskDiscoveryExperience(fixture.store, record!, {
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
