/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSpaceRecord,
  createStore,
  createTaskRecord,
  getTaskProfile,
  listRecommendationBundlesByTask,
  replaceRecommendationBundles,
  saveTaskProfile,
  type RecommendationBundle,
  type TaskProfile,
} from "@/lib/store";

function createIsolatedStore() {
  const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-task-intelligence-test-"));
  const filename = join(tempDirectory, "store.sqlite");
  const store = createStore(filename);
  let closed = false;

  return {
    filename,
    store,
    closeStore() {
      if (!closed) {
        store.database.close();
        closed = true;
      }
    },
    cleanup() {
      if (!closed) {
        store.database.close();
        closed = true;
      }
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}

describe("task intelligence store helpers", () => {
  it("persists task profiles across store instances", () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = createSpaceRecord(fixture.store, { name: "AI Signals" });
      const taskId = createTaskRecord(fixture.store, {
        spaceId,
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agent launches and evaluations",
      });
      const profile: TaskProfile = {
        keywords: ["coding agents", "agent benchmarks", "developer tools"],
        suggestedQueries: [
          "coding agent release notes",
          "software agent benchmark results",
          "developer tool ai changelog",
        ],
      };

      saveTaskProfile(fixture.store, taskId, profile);
      fixture.closeStore();

      const reopenedStore = createStore(fixture.filename);

      try {
        expect(getTaskProfile(reopenedStore, taskId)).toEqual(profile);
      } finally {
        reopenedStore.database.close();
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("replaces recommendation bundles for one task without affecting others", () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = createSpaceRecord(fixture.store, { name: "AI Signals" });
      const taskId = createTaskRecord(fixture.store, {
        spaceId,
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agent launches and evaluations",
      });
      const otherTaskId = createTaskRecord(fixture.store, {
        spaceId,
        title: "Frontier models",
        taskType: "TOPIC",
        userPrompt: "Track frontier model launches",
      });

      const initialBundles: RecommendationBundle[] = [
        {
          title: "Agent builder bundle",
          description: "Commercial coding agent release feeds.",
          rationale: "Tracks product updates from leading agent vendors.",
          sources: [
            {
              title: "Cursor changelog",
              url: "https://cursor.sh/changelog",
              sourceType: "PAGE",
            },
            {
              title: "Cognition blog",
              url: "https://cognition.ai/blog/rss.xml",
              sourceType: "RSS",
            },
          ],
        },
        {
          title: "Benchmark bundle",
          description: "Independent evaluations and benchmarks.",
          rationale: "Pairs vendor announcements with third-party measurement.",
          sources: [
            {
              title: "Inspect evaluations",
              url: "https://example.com/inspect-evals",
              sourceType: "PAGE",
            },
          ],
        },
      ];
      const replacementBundles: RecommendationBundle[] = [
        {
          title: "Open model agent bundle",
          description: "Open source agent project updates.",
          rationale: "Shifts focus from commercial vendors to open ecosystems.",
          sources: [
            {
              title: "OpenHands releases",
              url: "https://github.com/All-Hands-AI/OpenHands/releases",
              sourceType: "PAGE",
            },
          ],
        },
      ];
      const otherTaskBundles: RecommendationBundle[] = [
        {
          title: "Model labs bundle",
          description: "Primary labs and API release notes.",
          rationale: "Covers vendor-owned launch surfaces.",
          sources: [
            {
              title: "OpenAI news",
              url: "https://openai.com/news/",
              sourceType: "PAGE",
            },
          ],
        },
      ];

      replaceRecommendationBundles(fixture.store, taskId, initialBundles);
      replaceRecommendationBundles(fixture.store, otherTaskId, otherTaskBundles);

      expect(listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        initialBundles,
      );
      expect(
        listRecommendationBundlesByTask(fixture.store, otherTaskId),
      ).toEqual(otherTaskBundles);

      replaceRecommendationBundles(fixture.store, taskId, replacementBundles);

      expect(listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        replacementBundles,
      );
      expect(
        listRecommendationBundlesByTask(fixture.store, otherTaskId),
      ).toEqual(otherTaskBundles);
    } finally {
      fixture.cleanup();
    }
  });
});
