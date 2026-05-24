/// <reference types="vitest/globals" />

import { refreshTaskIntelligence } from "@/lib/task-intelligence";
import {
  createTaskRecord,
  getTaskProfile,
  listRecommendationBundlesByTask,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("task intelligence for personal monitoring goals", () => {
  it("stores a task profile and source bundles for a task", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track coding agents",
        taskType: "TOPIC",
        userPrompt: "Monitor Devin and Cursor coding agent updates.",
      });

      await refreshTaskIntelligence(fixture.store, taskId, {
        understandTaskIntentImpl: vi.fn().mockResolvedValue({
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

      expect(await getTaskProfile(fixture.store, taskId)).toEqual({
        keywords: ["Devin", "Cursor", "coding agent"],
        suggestedQueries: ["Devin Cursor coding agent updates"],
      });
      expect(await listRecommendationBundlesByTask(fixture.store, taskId)).toEqual([
        expect.objectContaining({ title: "Official sources" }),
        expect.objectContaining({ title: "Search discovery" }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("throws for missing tasks", async () => {
    const fixture = createSqliteFixture();

    try {
      await expect(refreshTaskIntelligence(fixture.store, "missing")).rejects.toThrow(
        "Task missing not found.",
      );
    } finally {
      fixture.cleanup();
    }
  });
});
