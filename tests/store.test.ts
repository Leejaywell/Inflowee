/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  listSourcesByTask,
} from "@/lib/store";

describe("store source persistence", () => {
  it("lists RSS sources by task from an isolated database", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = createSpaceRecord(store, {
        name: "OpenAI",
      });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Monitor feed",
        taskType: "TOPIC",
        userPrompt: "Track RSS updates",
      });

      createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });

      expect(listSourcesByTask(store, taskId)).toEqual([
        expect.objectContaining({
          taskId,
          sourceType: "RSS",
          title: "OpenAI News",
          url: "https://example.com/feed.xml",
          status: "idle",
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
