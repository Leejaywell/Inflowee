/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";

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
      const spaceId = await createSpaceRecord(fixture.store, { name: "AI" });
      const taskId = await createTaskRecord(fixture.store, {
        spaceId,
        title: "Task",
        taskType: "TOPIC",
        userPrompt: "Track signals",
      });
      const dueSourceId = await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Due source",
        url: "https://example.com/due.xml",
      });
      const failingSourceId = await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Failing source",
        url: "https://example.com/failing.xml",
      });
      const futureSourceId = await createSourceRecord(fixture.store, {
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

      const dueSource = await getSourceById(fixture.store, dueSourceId);
      const failingSource = await getSourceById(fixture.store, failingSourceId);

      const result = await syncDueSources(fixture.store, {
        now: "2026-05-22T08:00:00.000Z",
        syncSourceByIdImpl: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            source: dueSource!,
            insertedItemCount: 3,
            createdBriefCount: 1,
          })
          .mockResolvedValueOnce({
            ok: false,
            source: failingSource!,
            error: "Feed request timed out.",
          }),
      });

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
      expect((await getSourceById(fixture.store, dueSourceId))?.nextSyncAt).toBe(
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

describe("scheduled sync actions and surfaces", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("next/cache");
    vi.unmock("next/navigation");
    vi.unmock("@/lib/store");
    vi.unmock("@/app/actions");
  });

  it("updates source cadence from a server action", async () => {
    const revalidatePath = vi.fn();
    const redirect = vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
    const setSourceScheduleMock = vi.fn();

    vi.doMock("next/cache", () => ({
      revalidatePath,
    }));
    vi.doMock("next/navigation", () => ({
      redirect,
    }));
    vi.doMock("@/lib/store", async () => {
      const actual = await vi.importActual<typeof import("@/lib/store")>("@/lib/store");
      return {
        ...actual,
        defaultStore: { database: {} },
        setSourceSchedule: setSourceScheduleMock,
      };
    });

    const { updateSourceSchedule } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("sourceId", "source-1");
    formData.set("syncIntervalMinutes", "60");

    await expect(updateSourceSchedule(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/sources?updated=schedule",
    );

    expect(setSourceScheduleMock).toHaveBeenCalledWith(
      { database: {} },
      "source-1",
      60,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/sources");
  });

  it("renders cadence controls and recent run badges on the sources page", async () => {
    vi.doMock("@/app/actions", () => ({
      createSource: vi.fn(),
      deleteSource: vi.fn(),
      runSourceSync: vi.fn(),
      runSyncAll: vi.fn(),
      updateSourceSchedule: vi.fn(),
    }));
    vi.doMock("@/lib/store", () => ({
      defaultStore: {},
      listSpacesWithTasks: () => [
        {
          id: "space-1",
          name: "AI Signals",
          description: null,
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T00:00:00.000Z",
          tasks: [
            {
              id: "task-1",
              spaceId: "space-1",
              title: "Coding agents",
              taskType: "TOPIC",
              userPrompt: "Track coding agents",
              relevanceLevel: 3,
              summaryPreference: "balanced",
              taskProfile: null,
              createdAt: "2026-05-22T00:00:00.000Z",
              updatedAt: "2026-05-22T00:00:00.000Z",
            },
          ],
        },
      ],
      listSources: () => [
        {
          id: "source-1",
          taskId: "task-1",
          sourceType: "RSS",
          title: "OpenAI feed",
          url: "https://example.com/feed.xml",
          status: "success",
          lastSyncedAt: "2026-05-22T07:00:00.000Z",
          lastError: null,
          syncIntervalMinutes: 60,
          nextSyncAt: "2026-05-22T08:00:00.000Z",
          recentRuns: [
            {
              id: "run-1",
              sourceId: "source-1",
              status: "success",
              insertedItemCount: 2,
              createdBriefCount: 1,
              error: null,
              startedAt: "2026-05-22T07:00:00.000Z",
              finishedAt: "2026-05-22T07:01:00.000Z",
            },
          ],
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T07:01:00.000Z",
        },
      ],
      listRecentSyncRunsBySource: () => [
        {
          id: "run-1",
          sourceId: "source-1",
          status: "success",
          insertedItemCount: 2,
          createdBriefCount: 1,
          error: null,
          startedAt: "2026-05-22T07:00:00.000Z",
          finishedAt: "2026-05-22T07:01:00.000Z",
        },
      ],
    }));

    const { default: SourcesPage } = await import("@/app/sources/page");
    const page = await SourcesPage({
      searchParams: Promise.resolve({ updated: "schedule" } as never),
    });

    render(page);

    expect(screen.getByText("Every 60 min")).toBeInTheDocument();
    expect(screen.getByText("Recent runs")).toBeInTheDocument();
    expect(screen.getByText("2 items / 1 briefs")).toBeInTheDocument();
  });
});
