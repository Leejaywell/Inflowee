/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ChatConsole } from "@/components/chat-console";
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
import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";

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
  it("persists task profiles across store instances", async () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Signals",
      });
      const taskId = await createTaskRecord(fixture.store, {
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

      await saveTaskProfile(fixture.store, taskId, profile);
      fixture.closeStore();

      const reopenedStore = createStore(fixture.filename);

      try {
        expect(await getTaskProfile(reopenedStore, taskId)).toEqual(profile);
      } finally {
        reopenedStore.database.close();
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("replaces recommendation bundles for one task without affecting others", async () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Signals",
      });
      const taskId = await createTaskRecord(fixture.store, {
        spaceId,
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agent launches and evaluations",
      });
      const otherTaskId = await createTaskRecord(fixture.store, {
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

      await replaceRecommendationBundles(fixture.store, taskId, initialBundles);
      await replaceRecommendationBundles(
        fixture.store,
        otherTaskId,
        otherTaskBundles,
      );

      expect(await listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        initialBundles,
      );
      expect(
        await listRecommendationBundlesByTask(fixture.store, otherTaskId),
      ).toEqual(otherTaskBundles);

      await replaceRecommendationBundles(
        fixture.store,
        taskId,
        replacementBundles,
      );

      expect(await listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        replacementBundles,
      );
      expect(
        await listRecommendationBundlesByTask(fixture.store, otherTaskId),
      ).toEqual(otherTaskBundles);
    } finally {
      fixture.cleanup();
    }
  });

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "persists task profiles and recommendation bundles through the postgres-backed store",
    async () => {
    const fixture = await createIsolatedPostgresStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Signals",
      });
      const taskId = await createTaskRecord(fixture.store, {
        spaceId,
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agent launches and evaluations",
      });

      const profile: TaskProfile = {
        keywords: ["coding agents"],
        suggestedQueries: ["coding agents changelog"],
      };
      const bundles: RecommendationBundle[] = [
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
      ];

      await saveTaskProfile(fixture.store, taskId, profile);
      await replaceRecommendationBundles(fixture.store, taskId, bundles);

      expect(await getTaskProfile(fixture.store, taskId)).toEqual(profile);
      expect(await listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        bundles,
      );
    } finally {
      await fixture.cleanup();
    }
  }, 15_000);
});

describe("task intelligence server actions", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("next/cache");
    vi.unmock("next/navigation");
    vi.unmock("@/lib/store");
    vi.unmock("@/lib/task-intelligence");
    },
  );

  it("initializes stored intelligence after createTask succeeds", async () => {
    const revalidatePath = vi.fn();
    const redirect = vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
      const createTaskRecordMock = vi.fn().mockResolvedValue("task-123");
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

    const { refreshStoredTaskIntelligence } = await import("@/app/actions");

    await expect(refreshStoredTaskIntelligence("task-123")).resolves.toEqual({
      success: true,
    });

    expect(refreshTaskIntelligenceMock).toHaveBeenCalledWith(defaultStore, "task-123");
    expect(revalidatePath).toHaveBeenCalledWith("/spaces/space-9/tasks/task-123");
  });

  it("stores assistant provenance in the returned chat payload", async () => {
    const revalidatePath = vi.fn();
    const getOrCreateChatThread = vi.fn().mockReturnValue({
      id: "thread-1",
      scopeType: "task",
      scopeId: "task-1",
      createdAt: "2026-05-22T00:00:00.000Z",
    });
    const createChatMessage = vi.fn();
    const listChatMessages = vi.fn().mockReturnValue([
      { role: "user", content: "What changed today?" },
    ]);
    const answerGroundedQuestion = vi.fn().mockResolvedValue({
      content: "Stored grounding was empty.",
      citations: ["https://openai.com/changelog"],
      provenance: "mixed",
    });
    const getGroundingForScope = vi.fn().mockReturnValue({
      briefs: [],
      items: [],
    });
    const defaultStore = {
      database: {
        prepare: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({ space_id: "space-1" }),
        }),
      },
    };

    vi.doMock("next/cache", () => ({
      revalidatePath,
    }));
    vi.doMock("@/lib/store", () => ({
      createChatMessage,
      createSourceRecord: vi.fn(),
      deleteChatMessagesByThreadId: vi.fn(),
      defaultStore,
      getTaskById: vi.fn().mockResolvedValue({
        id: "task-1",
        spaceId: "space-1",
      }),
      getOrCreateChatThread,
      listChatMessages,
      updateTaskControls: vi.fn(),
    }));
    vi.doMock("@/lib/ai", () => ({
      answerGroundedQuestion,
    }));
    vi.doMock("@/lib/grounding", () => ({
      getGroundingForScope,
    }));
    vi.doMock("@/lib/live-fetch", () => ({
      fetchLiveContext: vi.fn(),
    }));
    vi.doMock("@/lib/auth", () => ({
      assertBriefAccess: vi.fn(),
      assertSpaceAccess: vi.fn(),
      assertTaskAccess: vi.fn(),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
    }));

    const { submitChatMessage } = await import("@/app/actions-chat");
    const result = await submitChatMessage("task", "task-1", "What changed today?");

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        provenance: "mixed",
      }),
    );
    expect(createChatMessage).toHaveBeenNthCalledWith(
      2,
      defaultStore,
      expect.objectContaining({
        threadId: "thread-1",
        role: "assistant",
        provenance: "mixed",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/spaces/space-1/tasks/task-1");
  });
});

describe("ChatConsole provenance labels", () => {
  it("renders a live-context badge when provenance is mixed", () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      createElement(ChatConsole, {
        scopeType: "task",
        scopeId: "task-1",
        initialMessages: [
          {
            id: "m-1",
            threadId: "t-1",
            role: "assistant",
            content: "Stored grounding was empty.",
            citations: ["https://openai.com/changelog"],
            provenance: "mixed",
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(screen.getByText("Live context")).toBeInTheDocument();
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
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Watch",
      });
      const taskId = await createTaskRecord(fixture.store, {
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
      expect((await getTaskProfile(fixture.store, taskId))?.keywords).toEqual([
        "coding agents",
      ]);
      expect(await listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
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
      deleteChatMessagesByThreadId: vi.fn(),
      defaultStore,
      getTaskById: vi.fn().mockResolvedValue({
        id: "task-123",
        spaceId: "space-9",
      }),
      getOrCreateChatThread: vi.fn(),
      listChatMessages: vi.fn(),
      updateTaskControls: vi.fn(),
    }));
    vi.doMock("@/lib/auth", () => ({
      assertBriefAccess: vi.fn(),
      assertSpaceAccess: vi.fn(),
      assertTaskAccess: vi.fn(),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
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
      deleteChatMessagesByThreadId: vi.fn(),
      defaultStore,
      getTaskById: vi.fn().mockResolvedValue({
        id: "task-123",
        spaceId: "space-9",
      }),
      getOrCreateChatThread: vi.fn(),
      listChatMessages: vi.fn(),
      updateTaskControls: vi.fn(),
    }));
    vi.doMock("@/lib/auth", () => ({
      assertBriefAccess: vi.fn(),
      assertSpaceAccess: vi.fn(),
      assertTaskAccess: vi.fn(),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
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
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Watch",
      });
      const taskId = await createTaskRecord(fixture.store, {
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

      await saveTaskProfile(fixture.store, taskId, existingProfile);
      await replaceRecommendationBundles(
        fixture.store,
        taskId,
        existingBundles,
      );

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

      expect(await getTaskProfile(fixture.store, taskId)).toEqual(existingProfile);
      expect(await listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        existingBundles,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("restores previous bundles and keeps the old profile when profile save fails", async () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Watch",
      });
      const taskId = await createTaskRecord(fixture.store, {
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

      await saveTaskProfile(fixture.store, taskId, existingProfile);
      await replaceRecommendationBundles(
        fixture.store,
        taskId,
        existingBundles,
      );

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

      expect(await getTaskProfile(fixture.store, taskId)).toEqual(existingProfile);
      expect(await listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        existingBundles,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("restores previous bundles when injected bundle persistence mutates state then fails", async () => {
    const fixture = createIsolatedStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Watch",
      });
      const taskId = await createTaskRecord(fixture.store, {
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

      await saveTaskProfile(fixture.store, taskId, existingProfile);
      await replaceRecommendationBundles(
        fixture.store,
        taskId,
        existingBundles,
      );

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
            void replaceRecommendationBundles(currentStore, currentTaskId, bundles);
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

      expect(await getTaskProfile(fixture.store, taskId)).toEqual(existingProfile);
      expect(await listRecommendationBundlesByTask(fixture.store, taskId)).toEqual(
        existingBundles,
      );
    } finally {
      fixture.cleanup();
    }
  });
});
