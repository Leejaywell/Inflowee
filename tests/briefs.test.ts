/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { buildBriefsFromItems } from "@/lib/briefs";
import {
  createItemRecordResult,
  createBriefRecord,
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  getTaskBySourceId,
  listBriefs,
} from "@/lib/store";

afterEach(() => {
  vi.resetModules();
  vi.unmock("@/lib/auth");
  vi.unmock("@/lib/store");
});

describe("buildBriefsFromItems", () => {
  it("renders the inbox heading", async () => {
    vi.doMock("@/lib/store", () => ({
      defaultStore: { database: {} },
      listBriefsFiltered: vi.fn().mockResolvedValue([]),
      listSpacesWithTasks: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/lib/auth", () => ({
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
    }));

    const { default: InboxPage } = await import("@/app/inbox/page");
    const view = await InboxPage({ searchParams: Promise.resolve({}) });

    render(view);

    expect(
      screen.getByRole("heading", { name: "Brief inbox" }),
    ).toBeInTheDocument();
  });

  it("renders the brief detail page with actor-scoped chat history", async () => {
    const getOrCreateChatThread = vi.fn().mockResolvedValue({
      id: "thread-1",
      scopeType: "brief",
      scopeId: "brief-1:actor:local-user",
      createdAt: "2026-05-22T00:00:00.000Z",
    });

    vi.doMock("@/lib/store", () => ({
      defaultStore: { database: {} },
      getBriefById: vi.fn().mockResolvedValue({
        id: "brief-1",
        taskId: "task-1",
        title: "Launch roundup",
        summary: "Latest launches.",
        whyItMatters: "New signal.",
        sourceCitations: ["https://example.com/launch"],
        relevanceScore: 0.5,
        importanceScore: 0.5,
        tags: [],
        isRead: false,
        createdAt: "2026-05-22T00:00:00.000Z",
        taskTitle: "Agent launches",
        spaceName: "AI Watch",
      }),
      getOrCreateChatThread,
      getWebhookSettings: vi.fn().mockResolvedValue({ endpoint: null }),
      getSlackSettings: vi.fn().mockResolvedValue({ endpoint: null }),
      listBriefItemIds: vi.fn().mockResolvedValue(["item-1"]),
      listChatMessages: vi.fn().mockResolvedValue([]),
      listItemsByBriefId: vi.fn().mockResolvedValue([
        {
          id: "item-1",
          title: "Launch roundup",
          canonicalUrl: "https://example.com/launch",
        },
      ]),
      listRecentDeliveryLogsByBrief: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/lib/auth", () => ({
      assertBriefAccess: vi.fn(),
      getActorScopedChatScopeId: vi.fn((actorId: string, scopeId: string) =>
        `${scopeId}:actor:${actorId}`,
      ),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
    }));
    vi.doMock("@/app/actions", () => ({
      sendBriefToSlack: vi.fn(),
      sendBriefToWebhook: vi.fn(),
    }));

    const { default: BriefDetailPage } = await import("@/app/inbox/[briefId]/page");
    const view = await BriefDetailPage({
      params: Promise.resolve({ briefId: "brief-1" }),
      searchParams: Promise.resolve({}),
    });

    render(view);

    expect(getOrCreateChatThread).toHaveBeenCalledWith(
      { database: {} },
      "brief",
      "brief-1:actor:local-user",
    );
    expect(
      screen.getByRole("heading", { name: "Launch roundup" }),
    ).toBeInTheDocument();
  });

  it("returns 404 for html digest when brief access is forbidden", async () => {
    vi.doMock("@/lib/auth", () => ({
      assertBriefAccess: vi.fn().mockRejectedValue(new Error("Forbidden")),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "user-2",
        email: "user-2@example.com",
      }),
    }));
    vi.doMock("@/lib/store", () => ({
      defaultStore: { database: {} },
      getBriefById: vi.fn(),
      listItemsByBriefId: vi.fn(),
    }));

    const { GET } = await import("@/app/inbox/[briefId]/html/route");
    const response = await GET(new Request("https://example.com"), {
      params: Promise.resolve({ briefId: "brief-1" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns private non-cacheable image responses for authorized requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      }),
    );
    vi.doMock("@/lib/auth", () => ({
      assertBriefAccess: vi.fn(),
      requireSessionActor: vi.fn().mockResolvedValue({
        id: "local-user",
        email: "local@inflowee.dev",
      }),
    }));
    vi.doMock("@/lib/store", () => ({
      defaultStore: { database: {} },
      getBriefById: vi.fn().mockResolvedValue({
        id: "brief-1",
        taskId: "task-1",
        title: "Launch roundup",
        summary: "Latest launches.",
        whyItMatters: "New signal.",
        sourceCitations: [],
        relevanceScore: 0.5,
        importanceScore: 0.5,
        tags: [],
        isRead: false,
        createdAt: "2026-05-22T00:00:00.000Z",
      }),
    }));
    vi.doMock("node:fs/promises", async () => {
      const actual = await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
      return {
        ...actual,
        readFile: vi.fn().mockResolvedValue(Buffer.from("font")),
      };
    });
    vi.doMock("satori", () => ({
      default: vi.fn().mockResolvedValue("<svg></svg>"),
    }));
    vi.doMock("@resvg/resvg-js", () => ({
      Resvg: class {
        render() {
          return {
            asPng() {
              return Buffer.from("png");
            },
          };
        }
      },
    }));

    const { GET } = await import("@/app/inbox/[briefId]/image/route");
    const response = await GET(new Request("https://example.com"), {
      params: Promise.resolve({ briefId: "brief-1" }),
    });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/png");
    vi.unstubAllGlobals();
  });

  it("turns new feed items into brief records", () => {
    const briefs = buildBriefsFromItems("task-1", [
      {
        id: "item-1",
        title: "Launch roundup",
        canonicalUrl: "https://example.com/posts/launch-roundup",
        summary: "Latest launches and product updates.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      },
    ]);

    expect(briefs).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        itemIds: ["item-1"],
        title: "Launch roundup",
        summary: "Latest launches and product updates.",
        whyItMatters: "New signal captured from subscribed RSS sources.",
        sourceCitations: ["https://example.com/posts/launch-roundup"],
        relevanceScore: 0.6,
        importanceScore: 0.6,
        tags: ["launch"],
      }),
    ]);
  });

  it("clusters same-event feed items into one higher-ranked brief", () => {
    const briefs = buildBriefsFromItems("task-1", [
      {
        id: "item-1",
        title: "OpenAI ships o4-mini",
        canonicalUrl: "https://example.com/posts/o4-mini-1",
        summary: "Launch coverage from source one.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      },
      {
        id: "item-2",
        title: "OpenAI releases o4 mini",
        canonicalUrl: "https://another.example.com/posts/o4-mini-2",
        summary: "Launch coverage from source two.",
        publishedAt: "2026-05-21T08:05:00.000Z",
      },
    ]);

    expect(briefs).toHaveLength(1);
    expect(briefs[0]).toEqual(
      expect.objectContaining({
        itemIds: ["item-1", "item-2"],
        importanceScore: 0.75,
        relevanceScore: 0.7,
        sourceCitations: [
          "https://example.com/posts/o4-mini-1",
          "https://another.example.com/posts/o4-mini-2",
        ],
      }),
    );
  });

  it("stores generated briefs with task and space context", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-briefs-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        name: "OpenAI",
      });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Monitor feed",
        taskType: "TOPIC",
        userPrompt: "Track RSS updates",
      });
      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });
      const item = await createItemRecordResult(store, {
        sourceId,
        title: "Launch roundup",
        canonicalUrl: "https://example.com/posts/launch-roundup",
        summary: "Latest launches and product updates.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      });

      expect(item).not.toBeNull();
      expect((await getTaskBySourceId(store, sourceId))?.id).toBe(taskId);

      const briefs = buildBriefsFromItems(taskId, [item!]);

      for (const brief of briefs) {
        await createBriefRecord(store, brief);
      }

      expect(await listBriefs(store)).toEqual([
        expect.objectContaining({
          taskId,
          title: "Launch roundup",
          summary: "Latest launches and product updates.",
          whyItMatters: "New signal captured from subscribed RSS sources.",
          sourceCitations: ["https://example.com/posts/launch-roundup"],
          relevanceScore: 0.6,
          importanceScore: 0.6,
          tags: ["launch"],
          taskTitle: "Monitor feed",
          spaceName: "OpenAI",
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("does not create duplicate briefs when the same source items sync twice", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-briefs-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        name: "OpenAI",
      });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Monitor feed",
        taskType: "TOPIC",
        userPrompt: "Track RSS updates",
      });
      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });

      const syncPayload = [
        {
          title: "Launch roundup",
          canonicalUrl: "https://example.com/posts/launch-roundup",
          summary: "Latest launches and product updates.",
          publishedAt: "2026-05-21T08:00:00.000Z",
        },
      ];

      const firstInsertedItems = (
        await Promise.all(
          syncPayload.map((item) =>
            createItemRecordResult(store, {
              sourceId,
              title: item.title,
              canonicalUrl: item.canonicalUrl,
              summary: item.summary,
              publishedAt: item.publishedAt,
            }),
          ),
        )
      ).filter((item) => item !== null);

      for (const brief of buildBriefsFromItems(taskId, firstInsertedItems)) {
        await createBriefRecord(store, brief);
      }

      const secondInsertedItems = (
        await Promise.all(
          syncPayload.map((item) =>
            createItemRecordResult(store, {
              sourceId,
              title: item.title,
              canonicalUrl: item.canonicalUrl,
              summary: item.summary,
              publishedAt: item.publishedAt,
            }),
          ),
        )
      ).filter((item) => item !== null);

      for (const brief of buildBriefsFromItems(taskId, secondInsertedItems)) {
        await createBriefRecord(store, brief);
      }

      expect(await listBriefs(store)).toHaveLength(1);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
