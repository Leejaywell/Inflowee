/// <reference types="vitest/globals" />

import { createDiscoverySourcesForTask } from "@/lib/discovery-subscriptions";
import {
  createSourceRecord,
  createTaskRecord,
  listSourcesByTask,
  saveTaskProfile,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("discovery source subscriptions", () => {
  it("creates normal Source records from selected discovery candidates", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        taskType: "TOPIC",
        userPrompt: "Monitor AI coding tools.",
      });
      await saveTaskProfile(fixture.store, taskId, {
        keywords: ["OpenAI"],
        suggestedQueries: ["OpenAI coding agent"],
      });

      const result = await createDiscoverySourcesForTask(fixture.store, taskId, [
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
      expect(await listSourcesByTask(fixture.store, taskId)).toContainEqual(
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
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        taskType: "TOPIC",
        userPrompt: "Monitor AI coding tools.",
      });
      await createSourceRecord(fixture.store, {
        taskId,
        title: "OpenAI Blog",
        url: "https://openai.com/blog/rss.xml",
        sourceType: "RSS",
      });

      const result = await createDiscoverySourcesForTask(fixture.store, taskId, [
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
      expect(await listSourcesByTask(fixture.store, taskId)).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });
});
