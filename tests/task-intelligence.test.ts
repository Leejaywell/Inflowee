/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

import { refreshTaskIntelligence } from "@/lib/task-intelligence";
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

describe("task intelligence server actions", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("next/cache");
    vi.unmock("next/navigation");
    vi.unmock("@/lib/store");
    vi.unmock("@/lib/task-intelligence");
  });

  it("initializes stored intelligence after createTask succeeds", async () => {
    const revalidatePath = vi.fn();
    const redirect = vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
    const createTaskRecordMock = vi.fn().mockReturnValue("task-123");
    const refreshTaskIntelligenceMock = vi.fn().mockResolvedValue({
      profile: {
        keywords: ["coding agents"],
        suggestedQueries: ["coding agents changelog"],
      },
      bundles: [],
    });
    const defaultStore = { database: {} };

    vi.doMock("next/cache", () => ({
      revalidatePath,
    }));
    vi.doMock("next/navigation", () => ({
      redirect,
    }));
    vi.doMock("@/lib/store", () => ({
      createSourceRecord: vi.fn(),
      createSpaceRecord: vi.fn(),
      createTaskRecord: createTaskRecordMock,
      defaultStore,
      deleteBrief: vi.fn(),
      deleteSource: vi.fn(),
      deleteSpace: vi.fn(),
      deleteTask: vi.fn(),
      getTaskById: vi.fn(),
      hasTaskRecord: vi.fn(),
      markBriefRead: vi.fn(),
      markBriefUnread: vi.fn(),
    }));
    vi.doMock("@/lib/task-intelligence", () => ({
      refreshTaskIntelligence: refreshTaskIntelligenceMock,
    }));

    const { createTask } = await import("@/app/actions");

    const formData = new FormData();
    formData.set("spaceId", "space-1");
    formData.set("title", "Track coding agents");
    formData.set("taskType", "TOPIC");
    formData.set("userPrompt", "Track coding agent launches and evaluations");

    await expect(createTask(formData)).rejects.toThrow("NEXT_REDIRECT:/?created=task");

    expect(createTaskRecordMock).toHaveBeenCalledWith({
      spaceId: "space-1",
      title: "Track coding agents",
      taskType: "TOPIC",
      userPrompt: "Track coding agent launches and evaluations",
    });
    expect(refreshTaskIntelligenceMock).toHaveBeenCalledWith(defaultStore, "task-123");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(redirect).toHaveBeenCalledWith("/?created=task");
  });

  it("revalidates the task detail route after explicit intelligence refresh", async () => {
    const revalidatePath = vi.fn();
    const refreshTaskIntelligenceMock = vi.fn().mockResolvedValue({
      profile: {
        keywords: ["coding agents"],
        suggestedQueries: ["coding agents changelog"],
      },
      bundles: [],
    });
    const defaultStore = { database: {} };

    vi.doMock("next/cache", () => ({
      revalidatePath,
    }));
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(),
    }));
    vi.doMock("@/lib/store", () => ({
      createSourceRecord: vi.fn(),
      createSpaceRecord: vi.fn(),
      createTaskRecord: vi.fn(),
      defaultStore,
      deleteBrief: vi.fn(),
      deleteSource: vi.fn(),
      deleteSpace: vi.fn(),
      deleteTask: vi.fn(),
      getTaskById: vi.fn().mockReturnValue({
        id: "task-123",
        spaceId: "space-9",
      }),
      hasTaskRecord: vi.fn(),
      markBriefRead: vi.fn(),
      markBriefUnread: vi.fn(),
    }));
    vi.doMock("@/lib/task-intelligence", () => ({
      refreshTaskIntelligence: refreshTaskIntelligenceMock,
    }));

    const { refreshStoredTaskIntelligence } = await import("@/app/actions");

    await expect(refreshStoredTaskIntelligence("task-123")).resolves.toEqual({
      success: true,
    });

    expect(refreshTaskIntelligenceMock).toHaveBeenCalledWith(defaultStore, "task-123");
    expect(revalidatePath).toHaveBeenCalledWith("/spaces/space-9/tasks/task-123");
  });
});

describe("refreshTaskIntelligence", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("next/cache");
    vi.unmock("@/lib/store");
  });

  it("persists profile and bundles for a task", async () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = createSpaceRecord(fixture.store, { name: "AI Watch" });
      const taskId = createTaskRecord(fixture.store, {
        spaceId,
        title: "Track agent launches",
        taskType: "QUESTION",
        userPrompt: "What changed in coding agents this week?",
      });

      const understandTaskIntentImpl = vi.fn().mockResolvedValue({
        keywords: ["coding agents"],
        suggestedQueries: ["coding agents changelog"],
      });
      const recommendSourceBundlesImpl = vi.fn().mockResolvedValue([
        {
          title: "Agent bundle",
          description: "Primary feeds",
          rationale: "Matches the task",
          sources: [
            {
              title: "Feed",
              url: "https://example.com/feed.xml",
              sourceType: "RSS",
            },
          ],
        },
      ]);

      const result = await refreshTaskIntelligence(fixture.store, taskId, {
        understandTaskIntentImpl,
        recommendSourceBundlesImpl,
      });

      expect(understandTaskIntentImpl).toHaveBeenCalledWith(
        "What changed in coding agents this week?",
      );
      expect(recommendSourceBundlesImpl).toHaveBeenCalledWith(
        "What changed in coding agents this week?",
        { bypassCache: true },
      );
      expect(result.profile.keywords).toEqual(["coding agents"]);
      expect(result.bundles).toHaveLength(1);
      expect(getTaskProfile(fixture.store, taskId)?.keywords).toEqual([
        "coding agents",
      ]);
      expect(listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        result.bundles,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("validates recommended sources before creating them", async () => {
    const revalidatePath = vi.fn();
    const createSourceRecord = vi.fn();
    const defaultStore = {
      database: {
        prepare: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({ space_id: "space-9" }),
        }),
      },
    };

    vi.doMock("next/cache", () => ({
      revalidatePath,
    }));
    vi.doMock("@/lib/store", () => ({
      createChatMessage: vi.fn(),
      createSourceRecord,
      defaultStore,
      getOrCreateChatThread: vi.fn(),
      listChatMessages: vi.fn(),
      updateTaskControls: vi.fn(),
    }));

    const { subscribeRecommendedSources } = await import("@/app/actions-chat");

    await expect(
      subscribeRecommendedSources("task-123", [
        {
          title: "Bad source",
          url: "ftp://example.com/feed.xml",
          sourceType: "RSS",
        },
      ]),
    ).rejects.toThrow(
      "Recommended source 1 is invalid: Enter a valid http or https URL.",
    );

    expect(createSourceRecord).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("creates recommended sources only after schema validation passes", async () => {
    const revalidatePath = vi.fn();
    const createSourceRecord = vi.fn();
    const defaultStore = {
      database: {
        prepare: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({ space_id: "space-9" }),
        }),
      },
    };

    vi.doMock("next/cache", () => ({
      revalidatePath,
    }));
    vi.doMock("@/lib/store", () => ({
      createChatMessage: vi.fn(),
      createSourceRecord,
      defaultStore,
      getOrCreateChatThread: vi.fn(),
      listChatMessages: vi.fn(),
      updateTaskControls: vi.fn(),
    }));

    const { subscribeRecommendedSources } = await import("@/app/actions-chat");

    await expect(
      subscribeRecommendedSources("task-123", [
        {
          title: "Validated source",
          url: "https://example.com/feed.xml",
          sourceType: "RSS",
        },
      ]),
    ).resolves.toEqual({ success: true });

    expect(createSourceRecord).toHaveBeenCalledWith(defaultStore, {
      taskId: "task-123",
      sourceType: "RSS",
      title: "Validated source",
      url: "https://example.com/feed.xml",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/spaces/space-9/tasks/task-123");
    expect(revalidatePath).toHaveBeenCalledWith("/sources");
  });

  it("throws when the task does not exist", async () => {
    const fixture = createIsolatedStore();

    try {
      await expect(
        refreshTaskIntelligence(fixture.store, "missing-task-id"),
      ).rejects.toThrow("Task missing-task-id not found.");
    } finally {
      fixture.cleanup();
    }
  });

  it("does not persist new profile or bundles when source recommendation fails", async () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = createSpaceRecord(fixture.store, { name: "AI Watch" });
      const taskId = createTaskRecord(fixture.store, {
        spaceId,
        title: "Track agent launches",
        taskType: "QUESTION",
        userPrompt: "What changed in coding agents this week?",
      });

      const existingProfile: TaskProfile = {
        keywords: ["existing keyword"],
        suggestedQueries: ["existing query"],
      };
      const existingBundles: RecommendationBundle[] = [
        {
          title: "Existing bundle",
          description: "Existing sources",
          rationale: "Existing rationale",
          sources: [
            {
              title: "Existing feed",
              url: "https://example.com/existing.xml",
              sourceType: "RSS",
            },
          ],
        },
      ];

      saveTaskProfile(fixture.store, taskId, existingProfile);
      replaceRecommendationBundles(fixture.store, taskId, existingBundles);

      const understandTaskIntentImpl = vi.fn().mockResolvedValue({
        keywords: ["new keyword"],
        suggestedQueries: ["new query"],
      });
      const recommendSourceBundlesImpl = vi
        .fn()
        .mockRejectedValue(new Error("recommendation failed"));

      await expect(
        refreshTaskIntelligence(fixture.store, taskId, {
          understandTaskIntentImpl,
          recommendSourceBundlesImpl,
        }),
      ).rejects.toThrow("recommendation failed");

      expect(getTaskProfile(fixture.store, taskId)).toEqual(existingProfile);
      expect(listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        existingBundles,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("restores previous bundles and keeps the old profile when profile save fails", async () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = createSpaceRecord(fixture.store, { name: "AI Watch" });
      const taskId = createTaskRecord(fixture.store, {
        spaceId,
        title: "Track agent launches",
        taskType: "QUESTION",
        userPrompt: "What changed in coding agents this week?",
      });

      const existingProfile: TaskProfile = {
        keywords: ["existing keyword"],
        suggestedQueries: ["existing query"],
      };
      const existingBundles: RecommendationBundle[] = [
        {
          title: "Existing bundle",
          description: "Existing sources",
          rationale: "Existing rationale",
          sources: [
            {
              title: "Existing feed",
              url: "https://example.com/existing.xml",
              sourceType: "RSS",
            },
          ],
        },
      ];

      saveTaskProfile(fixture.store, taskId, existingProfile);
      replaceRecommendationBundles(fixture.store, taskId, existingBundles);

      const understandTaskIntentImpl = vi.fn().mockResolvedValue({
        keywords: ["new keyword"],
        suggestedQueries: ["new query"],
      });
      const recommendSourceBundlesImpl = vi.fn().mockResolvedValue([
        {
          title: "New bundle",
          description: "New sources",
          rationale: "New rationale",
          sources: [
            {
              title: "New feed",
              url: "https://example.com/new.xml",
              sourceType: "RSS",
            },
          ],
        },
      ]);
      const saveTaskProfileImpl = vi.fn().mockImplementation(() => {
        throw new Error("profile persistence failed");
      });

      await expect(
        refreshTaskIntelligence(fixture.store, taskId, {
          understandTaskIntentImpl,
          recommendSourceBundlesImpl,
          saveTaskProfileImpl,
        }),
      ).rejects.toThrow("profile persistence failed");

      expect(getTaskProfile(fixture.store, taskId)).toEqual(existingProfile);
      expect(listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        existingBundles,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("restores previous bundles when injected bundle persistence mutates state then fails", async () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = createSpaceRecord(fixture.store, { name: "AI Watch" });
      const taskId = createTaskRecord(fixture.store, {
        spaceId,
        title: "Track agent launches",
        taskType: "QUESTION",
        userPrompt: "What changed in coding agents this week?",
      });

      const existingProfile: TaskProfile = {
        keywords: ["existing keyword"],
        suggestedQueries: ["existing query"],
      };
      const existingBundles: RecommendationBundle[] = [
        {
          title: "Existing bundle",
          description: "Existing sources",
          rationale: "Existing rationale",
          sources: [
            {
              title: "Existing feed",
              url: "https://example.com/existing.xml",
              sourceType: "RSS",
            },
          ],
        },
      ];

      saveTaskProfile(fixture.store, taskId, existingProfile);
      replaceRecommendationBundles(fixture.store, taskId, existingBundles);

      const understandTaskIntentImpl = vi.fn().mockResolvedValue({
        keywords: ["new keyword"],
        suggestedQueries: ["new query"],
      });
      const recommendSourceBundlesImpl = vi.fn().mockResolvedValue([
        {
          title: "New bundle",
          description: "New sources",
          rationale: "New rationale",
          sources: [
            {
              title: "New feed",
              url: "https://example.com/new.xml",
              sourceType: "RSS",
            },
          ],
        },
      ]);
      const replaceRecommendationBundlesImpl = vi
        .fn()
        .mockImplementation(
          (
            currentStore,
            currentTaskId,
            bundles: RecommendationBundle[],
          ) => {
            replaceRecommendationBundles(currentStore, currentTaskId, bundles);
            throw new Error("bundle persistence failed");
          },
        );

      await expect(
        refreshTaskIntelligence(fixture.store, taskId, {
          understandTaskIntentImpl,
          recommendSourceBundlesImpl,
          replaceRecommendationBundlesImpl,
        }),
      ).rejects.toThrow("bundle persistence failed");

      expect(getTaskProfile(fixture.store, taskId)).toEqual(existingProfile);
      expect(listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        existingBundles,
      );
    } finally {
      fixture.cleanup();
    }
  });
});
