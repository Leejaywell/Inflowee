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
import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";

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

  it("records a failed result when syncing a due source throws", async () => {
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

      fixture.store.database
        .prepare("UPDATE sources SET next_sync_at = ? WHERE id = ?")
        .run("2026-05-22T07:58:00.000Z", dueSourceId);

      const dueSource = await getSourceById(fixture.store, dueSourceId);
      const result = await syncDueSources(fixture.store, {
        now: "2026-05-22T08:00:00.000Z",
        syncSourceByIdImpl: vi.fn().mockRejectedValue(new Error("Feed request timed out.")),
      });

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results).toEqual([
        {
          ok: false,
          error: "Feed request timed out.",
          source: dueSource,
        },
      ]);
      expect((await getSourceById(fixture.store, dueSourceId))?.nextSyncAt).toBe(
        "2026-05-22T07:58:00.000Z",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("returns scheduler summaries from the route handler", async () => {
    const enqueueScheduledSyncMock = vi.fn().mockResolvedValue({
      ids: ["evt_123"],
    });

    vi.resetModules();
    vi.doMock("@/lib/inngest", () => ({
      enqueueScheduledSync: enqueueScheduledSyncMock,
    }));

    const { POST } = await import("@/app/api/jobs/sync/route");
    const response = await POST();
    const payload = await response.json();

    expect(payload).toEqual(
      expect.objectContaining({
        queued: true,
        eventIds: ["evt_123"],
        now: expect.any(String),
      }),
    );
    expect(enqueueScheduledSyncMock).toHaveBeenCalledWith({
      now: expect.any(String),
    });
  });

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "syncs due postgres-backed sources and advances nextSyncAt",
    async () => {
    const fixture = await createIsolatedPostgresStore();

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

      await fixture.prisma.source.update({
        where: { id: dueSourceId },
        data: {
          nextSyncAt: new Date("2026-05-22T07:58:00.000Z"),
        },
      });

      const dueSource = await getSourceById(fixture.store, dueSourceId);
      const result = await syncDueSources(fixture.store, {
        now: "2026-05-22T08:00:00.000Z",
        syncSourceByIdImpl: vi.fn().mockResolvedValue({
          ok: true,
          source: dueSource!,
          insertedItemCount: 3,
          createdBriefCount: 1,
        }),
      });

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect((await getSourceById(fixture.store, dueSourceId))?.nextSyncAt).toBe(
        "2026-05-22T14:00:00.000Z",
      );
    } finally {
      await fixture.cleanup();
    }
  }, 15_000);
});

describe("scheduled sync actions and surfaces", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("next/cache");
    vi.unmock("next/navigation");
    vi.unmock("@/lib/store");
    vi.unmock("@/app/actions");
    },
  );

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
    vi.doMock("@/lib/auth", () => ({
      assertBriefAccess: vi.fn(),
      assertSourceAccess: vi.fn(),
      assertSpaceAccess: vi.fn(),
      assertTaskAccess: vi.fn(),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
    }));

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

  it("rejects webhook settings updates from a non-operator actor", async () => {
    const redirect = vi.fn();

    vi.doMock("next/cache", () => ({
      revalidatePath: vi.fn(),
    }));
    vi.doMock("next/navigation", () => ({
      redirect,
    }));
    vi.doMock("@/lib/store", async () => {
      const actual = await vi.importActual<typeof import("@/lib/store")>("@/lib/store");
      return {
        ...actual,
        defaultStore: { database: {} },
        saveWebhookSettings: vi.fn(),
      };
    });
    vi.doMock("@/lib/auth", () => ({
      requireOperatorSessionActor: vi
        .fn()
        .mockRejectedValue(new Error("Forbidden")),
      requireSessionActor: vi.fn(),
      assertBriefAccess: vi.fn(),
      assertSourceAccess: vi.fn(),
      assertSpaceAccess: vi.fn(),
      assertTaskAccess: vi.fn(),
    }));

    const { saveWebhookEndpoint } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("endpoint", "https://example.com/webhook");

    await expect(saveWebhookEndpoint(formData)).rejects.toThrow("Forbidden");
    expect(redirect).not.toHaveBeenCalled();
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
    vi.doMock("@/lib/auth", () => ({
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
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

  it("reads actor-scoped chat history on the space detail page", async () => {
    const getOrCreateChatThread = vi.fn().mockResolvedValue({
      id: "thread-1",
      scopeType: "space",
      scopeId: "space-1:actor:local-user",
      createdAt: "2026-05-22T00:00:00.000Z",
    });

    vi.doMock("@/lib/auth", () => ({
      assertSpaceAccess: vi.fn(),
      getActorScopedChatScopeId: vi.fn((actorId: string, scopeId: string) =>
        `${scopeId}:actor:${actorId}`,
      ),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
    }));
    vi.doMock("@/lib/store", () => ({
      defaultStore: {},
      getOrCreateChatThread,
      getSpaceById: vi.fn().mockResolvedValue({
        id: "space-1",
        ownerId: "local-user",
        name: "AI Signals",
        description: null,
        createdAt: "2026-05-22T00:00:00.000Z",
      }),
      listChatMessages: vi.fn().mockResolvedValue([]),
      listSpaceMembers: vi.fn().mockResolvedValue([]),
      listTasksBySpace: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/lib/grounding", () => ({
      getGroundingForScope: vi.fn().mockResolvedValue({ briefs: [], items: [] }),
    }));
    vi.doMock("@/components/chat-console", () => ({
      ChatConsole: () => null,
    }));
    vi.doMock("@/components/member-list", () => ({
      MemberList: () => null,
    }));

    const { default: SpaceDetailPage } = await import("@/app/spaces/[spaceId]/page");
    await SpaceDetailPage({
      params: Promise.resolve({ spaceId: "space-1" }),
    });

    expect(getOrCreateChatThread).toHaveBeenCalledWith(
      {},
      "space",
      "space-1:actor:local-user",
    );
  });

  it("reads actor-scoped chat history on the task detail page", async () => {
    const findChatThread = vi.fn().mockResolvedValue({
      id: "thread-1",
      scopeType: "task",
      scopeId: "task-1:actor:local-user",
      createdAt: "2026-05-22T00:00:00.000Z",
    });

    vi.doMock("@/lib/auth", () => ({
      assertTaskAccess: vi.fn(),
      getActorScopedChatScopeId: vi.fn((actorId: string, scopeId: string) =>
        `${scopeId}:actor:${actorId}`,
      ),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
    }));
    vi.doMock("@/lib/store", () => ({
      defaultStore: {},
      findChatThread,
      getSpaceById: vi.fn().mockResolvedValue({
        id: "space-1",
        ownerId: "local-user",
        name: "AI Signals",
        description: null,
        createdAt: "2026-05-22T00:00:00.000Z",
      }),
      getTaskById: vi.fn().mockResolvedValue({
        id: "task-1",
        spaceId: "space-1",
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agents",
        relevanceLevel: 3,
        summaryPreference: "balanced",
        taskProfile: null,
      }),
      listChatMessages: vi.fn().mockResolvedValue([]),
      listRecommendationBundlesByTask: vi.fn().mockResolvedValue([]),
      listSourcesByTask: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/components/chat-console", () => ({
      ChatConsole: () => null,
    }));
    vi.doMock("@/components/task-controls", () => ({
      TaskControls: () => null,
    }));
    vi.doMock("@/components/recommendation-wizard", () => ({
      RecommendationWizard: () => null,
    }));

    const { default: TaskDetailPage } = await import(
      "@/app/spaces/[spaceId]/tasks/[taskId]/page"
    );
    await TaskDetailPage({
      params: Promise.resolve({ spaceId: "space-1", taskId: "task-1" }),
    });

    expect(findChatThread).toHaveBeenCalledWith(
      {},
      "task",
      "task-1:actor:local-user",
    );
  });
});
