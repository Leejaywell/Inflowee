/// <reference types="vitest/globals" />

import {
  createSourceRecord,
  createSyncRun,
  createTaskRecord,
  finishSyncRun,
  listRecentSyncRuns,
  listRecentSyncRunsBySource,
  markSourceSyncResult,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("sync run tracking", () => {
  it("records source health and sync run summaries for personal sources", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agents.",
      });
      const sourceId = await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Agent feed",
        url: "https://example.com/feed.xml",
      });
      const runId = await createSyncRun(fixture.store, { sourceId });

      await markSourceSyncResult(fixture.store, {
        sourceId,
        status: "success",
      });
      await finishSyncRun(fixture.store, {
        runId,
        status: "success",
        insertedItemCount: 2,
        createdBriefCount: 1,
      });

      expect(await listRecentSyncRuns(fixture.store)).toEqual([
        expect.objectContaining({
          sourceId,
          insertedItemCount: 2,
          createdBriefCount: 1,
          status: "success",
        }),
      ]);
      expect(await listRecentSyncRunsBySource(fixture.store, sourceId)).toEqual([
        expect.objectContaining({ id: runId, status: "success" }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });
});
