/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  getSourceById,
} from "@/lib/store";
import { syncDueSources } from "@/lib/sync-runs";

function createFixture() {
  const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-sync-runs-test-"));
  const store = createStore(join(tempDirectory, "store.sqlite"));

  return {
    store,
    cleanup() {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}

describe("syncDueSources", () => {
  it("syncs only due sources and records run results", async () => {
    const fixture = createFixture();

    try {
      const spaceId = createSpaceRecord(fixture.store, { name: "AI" });
      const taskId = createTaskRecord(fixture.store, {
        spaceId,
        title: "Task",
        taskType: "TOPIC",
        userPrompt: "Track signals",
      });
      const dueSourceId = createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Due source",
        url: "https://example.com/due.xml",
      });
      const failingSourceId = createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Failing source",
        url: "https://example.com/failing.xml",
      });
      const futureSourceId = createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Future source",
        url: "https://example.com/future.xml",
      });

      fixture.store.database
        .prepare("UPDATE sources SET next_sync_at = ? WHERE id = ?")
        .run("2026-05-22T07:58:00.000Z", dueSourceId);
      fixture.store.database
        .prepare("UPDATE sources SET next_sync_at = ? WHERE id = ?")
        .run("2026-05-22T07:59:00.000Z", failingSourceId);
      fixture.store.database
        .prepare("UPDATE sources SET next_sync_at = ? WHERE id = ?")
        .run("2026-05-22T08:30:00.000Z", futureSourceId);

      const dueSource = getSourceById(fixture.store, dueSourceId)!;
      const failingSource = getSourceById(fixture.store, failingSourceId)!;

      const result = await syncDueSources(fixture.store, {
        now: "2026-05-22T08:00:00.000Z",
        syncSourceByIdImpl: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            source: dueSource,
            insertedItemCount: 3,
            createdBriefCount: 1,
          })
          .mockResolvedValueOnce({
            ok: false,
            source: failingSource,
            error: "Feed request timed out.",
          }),
      });

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(getSourceById(fixture.store, dueSourceId)?.nextSyncAt).toBe(
        "2026-05-22T14:00:00.000Z",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("returns scheduler summaries from the route handler", async () => {
    const syncDueSourcesMock = vi.fn().mockResolvedValue({
      synced: 2,
      failed: 1,
      skipped: 3,
      results: [],
    });

    vi.resetModules();
    vi.doMock("@/lib/sync-runs", () => ({
      syncDueSources: syncDueSourcesMock,
    }));
    vi.doMock("@/lib/store", () => ({
      defaultStore: { database: {} },
    }));

    const { POST } = await import("@/app/api/jobs/sync/route");
    const response = await POST();
    const payload = await response.json();

    expect(payload).toEqual(
      expect.objectContaining({
        synced: 2,
        failed: 1,
        skipped: 3,
      }),
    );
  });
});
