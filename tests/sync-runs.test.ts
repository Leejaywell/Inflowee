/// <reference types="vitest/globals" />

import {
  createSourceRecord,
  createSyncRun,
  createTaskRecord,
  finishSyncRun,
  listRecentSyncRuns,
  listRecentSyncRunsBySource,
  markSourceSyncResult,
  updateTaskScheduleProfile,
} from "@/lib/store";
import { syncDueSources } from "@/lib/sync-runs";
import { buildSchedulePreset } from "@/lib/task-schedule";
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

  it("skips due sources outside their task schedule window", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agents.",
      });
      await updateTaskScheduleProfile(
        fixture.store,
        taskId,
        buildSchedulePreset("office_hours", "Asia/Shanghai"),
      );
      await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Agent feed",
        url: "https://example.com/feed.xml",
      });
      const syncSourceByIdImpl = vi.fn();

      const result = await syncDueSources(fixture.store, {
        now: "2026-05-25T00:00:00.000Z",
        syncSourceByIdImpl,
      });

      expect(syncSourceByIdImpl).not.toHaveBeenCalled();
      expect(result).toEqual({
        synced: 0,
        failed: 0,
        skipped: 1,
        results: [],
      });
    } finally {
      fixture.cleanup();
    }
  });
});
