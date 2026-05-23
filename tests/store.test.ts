/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  briefExistsForItem,
  addSpaceMember,
  acceptSpaceInvite,
  countUnreadBriefs,
  createBriefRecord,
  createSpaceInvite,
  createItemRecord,
  createItemRecordResult,
  createSourceRecord,
  createSyncRun,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  createDeliveryLog,
  deleteBrief,
  deleteSource,
  deleteSpace,
  deleteTask,
  finishDeliveryLog,
  getBriefById,
  getDeliveryHealthSummary,
  getFeishuSettings,
  getSlackSettings,
  getTelegramSourceSettings,
  getTelegramSettings,
  getSourceHealthSummary,
  findChatThread,
  getWebhookSettings,
  hasTaskRecord,
  listBriefItemIds,
  listBriefsFiltered,
  listRecentDeliveryLogs,
  listRecentDeliveryLogsByBrief,
  listRecentSyncRuns,
  listItemsByBriefId,
  listItemsBySource,
  listRecentSyncRunsBySource,
  listSources,
  listSpacesWithTasks,
  listSpaceMembers,
  listSpaceInvites,
  listSourcesByTask,
  markBriefRead,
  markBriefUnread,
  removeSpaceMember,
  revokeSpaceInvite,
  markSourceSyncResult,
  getSourceById,
  getTaskById,
  getTaskProfile,
  saveFeishuSettings,
  saveTelegramSourceSettings,
  saveTelegramSettings,
  saveWebhookSettings,
  saveSlackSettings,
  saveTaskProfile,
  setSourceSchedule,
  finishSyncRun,
  updateTaskControls,
  getOrCreateChatThread,
  createChatMessage,
  listChatMessages,
  type Store,
} from "@/lib/store";
import { assertTaskAccess } from "@/lib/auth";
import {
  createSourceSchema,
  updateSourceScheduleSchema,
  webhookEndpointSchema,
} from "@/lib/validation";
import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";

describe("store promise contract", () => {
  it("does not expose a sqlite-backed default runtime store", async () => {
    const store = await createStore();
    expect(store.runtime).toBe("prisma");
  });

  it("returns promises for core write helpers", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const createSpaceResult = createSpaceRecord(store, {
        name: "Async Surface",
        description: "Promise contract check",
      });

      expect(createSpaceResult).toBeInstanceOf(Promise);

      const spaceId = await createSpaceResult;
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Async task",
        taskType: "TOPIC",
        userPrompt: "Track promise-based store behavior.",
      });

      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Example feed",
        url: "https://example.com/feed.xml",
      });

      expect(typeof sourceId).toBe("string");
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("returns promises for core read helpers", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        name: "Async Reads",
        description: undefined,
      });

      await createTaskRecord(store, {
        spaceId,
        title: "Read task",
        taskType: "TOPIC",
        userPrompt: "Track async reads.",
      });

      const listResult = listSpacesWithTasks(store);
      expect(listResult).toBeInstanceOf(Promise);

      const spaces = await listResult;
      expect(spaces).toEqual([
        expect.objectContaining({
          id: spaceId,
          tasks: [expect.objectContaining({ title: "Read task" })],
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "persists spaces tasks and sources through the postgres-backed store",
    async () => {
    const fixture = await createIsolatedPostgresStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "Signals",
      });
      const taskId = await createTaskRecord(fixture.store, {
        spaceId,
        title: "Track agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agents",
      });

      await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Agent feed",
        url: "https://example.com/feed.xml",
      });

      const spaces = await listSpacesWithTasks(fixture.store);
      const sources = await listSourcesByTask(fixture.store, taskId);

      expect(spaces[0]?.tasks[0]?.id).toBe(taskId);
      expect(sources[0]?.title).toBe("Agent feed");
    } finally {
      await fixture.cleanup();
    }
    },
    15_000,
  );

  it("lists only spaces owned by the current user", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      await createSpaceRecord(store, {
        ownerId: "user-1",
        name: "Signals",
      });
      await createSpaceRecord(store, {
        ownerId: "user-2",
        name: "Other",
      });

      const spaces = await listSpacesWithTasks(store, { ownerId: "user-1" });

      expect(spaces).toHaveLength(1);
      expect(spaces[0]?.ownerId).toBe("user-1");
      expect(spaces[0]?.name).toBe("Signals");
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("stores space membership roles", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        ownerId: "user-1",
        name: "Signals",
      });

      await addSpaceMember(store, {
        spaceId,
        userId: "user-2",
        role: "viewer",
      });

      expect(await listSpaceMembers(store, spaceId)).toEqual([
        expect.objectContaining({
          spaceId,
          userId: "user-2",
          role: "viewer",
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("updates and removes a stored space member", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        ownerId: "user-1",
        name: "Signals",
      });

      await addSpaceMember(store, {
        spaceId,
        userId: "user-2",
        role: "viewer",
      });
      await addSpaceMember(store, {
        spaceId,
        userId: "user-2",
        role: "editor",
      });

      expect(await listSpaceMembers(store, spaceId)).toEqual([
        expect.objectContaining({
          spaceId,
          userId: "user-2",
          role: "editor",
        }),
      ]);

      await removeSpaceMember(store, {
        spaceId,
        userId: "user-2",
      });

      expect(await listSpaceMembers(store, spaceId)).toEqual([]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("creates, accepts, and revokes invite records for a space", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        ownerId: "user-1",
        name: "Signals",
      });

      const invite = await createSpaceInvite(store, {
        spaceId,
        role: "viewer",
        createdBy: "user-1",
      });

      expect((await listSpaceInvites(store, spaceId))[0]).toEqual(
        expect.objectContaining({
          id: invite.id,
          token: invite.token,
          role: "viewer",
        }),
      );

      const acceptedInvite = await acceptSpaceInvite(store, {
        token: invite.token,
        actorId: "user-2",
      });

      expect(acceptedInvite).toEqual(
        expect.objectContaining({
          acceptedBy: "user-2",
        }),
      );
      expect(await listSpaceMembers(store, spaceId)).toEqual([
        expect.objectContaining({
          userId: "user-2",
          role: "viewer",
        }),
      ]);

      const secondInvite = await createSpaceInvite(store, {
        spaceId,
        role: "editor",
        createdBy: "user-1",
      });
      await revokeSpaceInvite(store, secondInvite.id);

      expect((await listSpaceInvites(store, spaceId))[0]).toEqual(
        expect.objectContaining({
          id: secondInvite.id,
          revokedAt: expect.any(String),
        }),
      );
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("scopes actor-visible sources briefs and delivery logs", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const actorSpaceId = await createSpaceRecord(store, {
        ownerId: "user-1",
        name: "Actor space",
      });
      const otherSpaceId = await createSpaceRecord(store, {
        ownerId: "user-2",
        name: "Other space",
      });
      const actorTaskId = await createTaskRecord(store, {
        spaceId: actorSpaceId,
        title: "Actor task",
        taskType: "TOPIC",
        userPrompt: "Track actor-owned updates.",
      });
      const otherTaskId = await createTaskRecord(store, {
        spaceId: otherSpaceId,
        title: "Other task",
        taskType: "TOPIC",
        userPrompt: "Track other updates.",
      });
      const actorSourceId = await createSourceRecord(store, {
        taskId: actorTaskId,
        sourceType: "RSS",
        title: "Actor feed",
        url: "https://example.com/actor.xml",
      });
      const otherSourceId = await createSourceRecord(store, {
        taskId: otherTaskId,
        sourceType: "RSS",
        title: "Other feed",
        url: "https://example.com/other.xml",
      });
      const actorItem = await createItemRecordResult(store, {
        sourceId: actorSourceId,
        title: "Actor item",
        canonicalUrl: "https://example.com/actor",
        summary: "Actor summary.",
      });
      const otherItem = await createItemRecordResult(store, {
        sourceId: otherSourceId,
        title: "Other item",
        canonicalUrl: "https://example.com/other",
        summary: "Other summary.",
      });

      if (!actorItem || !otherItem) {
        throw new Error("Expected both items to be inserted.");
      }

      const actorBriefId = await createBriefRecord(store, {
        taskId: actorTaskId,
        itemIds: [actorItem.id],
        title: "Actor brief",
        summary: "Actor summary.",
        whyItMatters: "Actor space only.",
        sourceCitations: ["https://example.com/actor"],
        relevanceScore: 0.5,
        importanceScore: 0.5,
        tags: [],
      });
      const otherBriefId = await createBriefRecord(store, {
        taskId: otherTaskId,
        itemIds: [otherItem.id],
        title: "Other brief",
        summary: "Other summary.",
        whyItMatters: "Other space only.",
        sourceCitations: ["https://example.com/other"],
        relevanceScore: 0.5,
        importanceScore: 0.5,
        tags: [],
      });

      const actorLogId = await createDeliveryLog(store, {
        briefId: actorBriefId,
        endpoint: "https://example.com/webhook",
        payloadType: "html",
      });
      const otherLogId = await createDeliveryLog(store, {
        briefId: otherBriefId,
        endpoint: "https://example.com/webhook",
        payloadType: "html",
      });

      await finishDeliveryLog(store, { logId: actorLogId, status: "success" });
      await finishDeliveryLog(store, { logId: otherLogId, status: "success" });

      expect(
        (await listSources(store, { actorId: "user-1" })).map((source) => source.id),
      ).toEqual([actorSourceId]);
      expect(
        (
          await listBriefsFiltered(store, {
            actorId: "user-1",
          })
        ).map((brief) => brief.id),
      ).toEqual([actorBriefId]);
      expect(
        (
          await listRecentDeliveryLogs(store, 10, {
            actorId: "user-1",
          })
        ).map((log) => log.briefId),
      ).toEqual([actorBriefId]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("rejects task access for a non-member actor", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        ownerId: "user-1",
        name: "Signals",
      });
      const createdAt = new Date().toISOString();
      store.database
        .prepare(
          `INSERT INTO tasks (
            id,
            space_id,
            title,
            task_type,
            user_prompt,
            relevance_level,
            summary_preference,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "task-owned-by-user-1",
          spaceId,
          "Private task",
          "TOPIC",
          "Track private signals.",
          3,
          "balanced",
          createdAt,
          createdAt,
        );

      await expect(
        assertTaskAccess(store, {
          actorId: "user-2",
          taskId: "task-owned-by-user-1",
          minimumRole: "viewer",
        }),
      ).rejects.toThrow("Forbidden");
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

describe("store source persistence", () => {
  it("rejects non-http source URLs", async () => {
    const parsed = createSourceSchema.safeParse({
      taskId: "task-123",
      sourceType: "RSS",
      title: "OpenAI News",
      url: "ftp://example.com/feed.xml",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      "Enter a valid http or https URL.",
    );
  });

  it("lists RSS sources by task from an isolated database", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
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

      await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });

      expect(await listSourcesByTask(store, taskId)).toEqual([
        expect.objectContaining({
          taskId,
          sourceType: "RSS",
          title: "OpenAI News",
          url: "https://example.com/feed.xml",
          status: "idle",
        }),
      ]);
      expect(await listSources(store)).toEqual([
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

  it("stores UPDATE, NEWSLETTER, TELEGRAM_PUBLIC, and TELEGRAM_BOT sources under a task", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        name: "OpenAI",
      });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Monitor updates",
        taskType: "TOPIC",
        userPrompt: "Track changelogs and newsletter archives",
      });

      await createSourceRecord(store, {
        taskId,
        sourceType: "UPDATE",
        title: "OpenAI Changelog",
        url: "https://openai.com/changelog",
      });
      await createSourceRecord(store, {
        taskId,
        sourceType: "NEWSLETTER",
        title: "Agent Archive",
        url: "https://example.com/archive",
      });
      await createSourceRecord(store, {
        taskId,
        sourceType: "TELEGRAM_PUBLIC",
        title: "Telegram feed",
        url: "https://t.me/s/example",
      });
      await createSourceRecord(store, {
        taskId,
        sourceType: "TELEGRAM_BOT",
        title: "Telegram bot feed",
        url: "https://t.me/example-bot-feed",
      });

      expect(await listSourcesByTask(store, taskId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            taskId,
            sourceType: "UPDATE",
            title: "OpenAI Changelog",
            url: "https://openai.com/changelog",
            status: "idle",
          }),
          expect.objectContaining({
            taskId,
            sourceType: "NEWSLETTER",
            title: "Agent Archive",
            url: "https://example.com/archive",
            status: "idle",
          }),
          expect.objectContaining({
            taskId,
            sourceType: "TELEGRAM_PUBLIC",
            title: "Telegram feed",
            url: "https://t.me/s/example",
            status: "idle",
          }),
          expect.objectContaining({
            taskId,
            sourceType: "TELEGRAM_BOT",
            title: "Telegram bot feed",
            url: "https://t.me/example-bot-feed",
            status: "idle",
          }),
        ]),
      );
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("stores default source cadence and next sync timestamp", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, { name: "OpenAI" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Monitor feed",
        taskType: "TOPIC",
        userPrompt: "Track RSS updates",
      });

      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI feed",
        url: "https://example.com/feed.xml",
      });

      const source = await getSourceById(store, sourceId);

      expect(source?.syncIntervalMinutes).toBe(360);
      expect(source?.nextSyncAt).toEqual(expect.any(String));
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("persists sync run rows for a source", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, { name: "OpenAI" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Monitor feed",
        taskType: "TOPIC",
        userPrompt: "Track RSS updates",
      });
      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI feed",
        url: "https://example.com/feed.xml",
      });

      const runId = await createSyncRun(store, { sourceId });

      await finishSyncRun(store, {
        runId,
        status: "success",
        insertedItemCount: 2,
        createdBriefCount: 1,
      });

      expect(await listRecentSyncRunsBySource(store, sourceId)).toEqual([
        expect.objectContaining({
          sourceId,
          status: "success",
          insertedItemCount: 2,
          createdBriefCount: 1,
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("summarizes source health and lists recent sync runs", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, { name: "Signals" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Track sources",
        taskType: "TOPIC",
        userPrompt: "Track source health.",
      });
      const healthySourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Healthy",
        url: "https://example.com/healthy.xml",
      });
      const failingSourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Failing",
        url: "https://example.com/failing.xml",
      });

      await markSourceSyncResult(store, {
        sourceId: healthySourceId,
        status: "success",
      });
      await markSourceSyncResult(store, {
        sourceId: failingSourceId,
        status: "error",
        error: "Fetch failed",
      });
      await setSourceSchedule(
        store,
        healthySourceId,
        15,
        "2000-01-01T00:00:00.000Z",
      );

      const syncRunId = await createSyncRun(store, { sourceId: healthySourceId });
      await finishSyncRun(store, {
        runId: syncRunId,
        status: "success",
        insertedItemCount: 2,
        createdBriefCount: 1,
      });

      expect(await getSourceHealthSummary(store)).toEqual({
        total: 2,
        healthy: 1,
        errored: 1,
        idle: 0,
        dueNow: 2,
      });

      expect(await listRecentSyncRuns(store, 5)).toEqual([
        expect.objectContaining({
          id: syncRunId,
          sourceId: healthySourceId,
          status: "success",
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("validates source cadence updates", async () => {
    const parsed = updateSourceScheduleSchema.safeParse({
      sourceId: "source-1",
      syncIntervalMinutes: "45",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.syncIntervalMinutes).toBe(45);
  });

  it("rejects newsletter archive sources without https", async () => {
    const parsed = createSourceSchema.safeParse({
      taskId: "task-123",
      sourceType: "NEWSLETTER",
      title: "Archive",
      url: "http://localhost/archive",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Enter a valid https URL.");
  });

  it("accepts telegram feed sources and rejects non-telegram URLs", async () => {
    const valid = createSourceSchema.safeParse({
      taskId: "task-123",
      sourceType: "TELEGRAM_PUBLIC",
      title: "Telegram feed",
      url: "https://t.me/examplejobs",
    });
    const validBot = createSourceSchema.safeParse({
      taskId: "task-123",
      sourceType: "TELEGRAM_BOT",
      title: "Telegram bot feed",
      url: "https://t.me/examplejobs",
    });
    const invalid = createSourceSchema.safeParse({
      taskId: "task-123",
      sourceType: "TELEGRAM_PUBLIC",
      title: "Telegram feed",
      url: "https://example.com/examplejobs",
    });

    expect(valid.success).toBe(true);
    expect(validBot.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.message).toBe(
      "Enter a valid public Telegram channel or group URL.",
    );
  });

  it("migrates an existing sources table to enforce valid status values", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const filename = join(tempDirectory, "store.sqlite");
    const legacyDatabase = new DatabaseSync(filename);

    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        title TEXT NOT NULL,
        task_type TEXT NOT NULL CHECK(task_type IN ('TOPIC', 'QUESTION')),
        user_prompt TEXT NOT NULL,
        relevance_level INTEGER NOT NULL DEFAULT 3,
        summary_preference TEXT NOT NULL DEFAULT 'balanced',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(space_id) REFERENCES spaces(id) ON DELETE CASCADE
      );

      CREATE TABLE sources (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('RSS')),
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        last_synced_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `);
    legacyDatabase.close();

    const store = createStore(filename);

    try {
      const spaceId = await createSpaceRecord(store, {
        name: "Migrated space",
      });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Migrated task",
        taskType: "TOPIC",
        userPrompt: "Track migrated schema",
      });

      const sourcesTable = store.database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sources'",
        )
        .get() as { sql: string };

      expect(sourcesTable.sql).toContain(
        "CHECK(status IN ('idle', 'success', 'error'))",
      );
      expect(sourcesTable.sql).toContain("'UPDATE'");
      expect(sourcesTable.sql).toContain("'NEWSLETTER'");
      expect(sourcesTable.sql).toContain("'TELEGRAM_PUBLIC'");
      expect(sourcesTable.sql).toContain("'TELEGRAM_BOT'");

      expect(() =>
        store.database
          .prepare(
            `INSERT INTO sources (
              id,
              task_id,
              source_type,
              title,
              url,
              status,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "invalid-status-source",
            taskId,
            "RSS",
            "Broken source",
            "https://example.com/invalid.xml",
            "broken",
            new Date().toISOString(),
            new Date().toISOString(),
          ),
      ).toThrow();
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("rejects stale task ids after the task has been removed", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
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

      store.database.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

      expect(await hasTaskRecord(store, taskId)).toBe(false);
      await expect(
        createSourceRecord(store, {
          taskId,
          sourceType: "RSS",
          title: "OpenAI News",
          url: "https://example.com/feed.xml",
        }),
      ).rejects.toThrow();
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

describe("store delivery persistence", () => {
  it("stores a single webhook endpoint in app settings", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-delivery-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      await saveWebhookSettings(store, "https://example.com/webhook");

      expect(await getWebhookSettings(store)).toEqual({
        endpoint: "https://example.com/webhook",
        updatedAt: expect.any(String),
      });
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("stores telegram source bot settings in app settings", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-delivery-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      await saveTelegramSourceSettings(store, {
        botToken: "123456:ABCDEF_bot",
      });

      expect(await getTelegramSourceSettings(store)).toEqual({
        botToken: "123456:ABCDEF_bot",
        updatedAt: expect.any(String),
      });
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("stores a Slack webhook endpoint in app settings", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-delivery-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      await saveSlackSettings(store, "https://hooks.slack.com/services/T/B/X");

      expect(await getSlackSettings(store)).toEqual({
        endpoint: "https://hooks.slack.com/services/T/B/X",
        updatedAt: expect.any(String),
      });
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("stores Telegram and Feishu delivery settings in app settings", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-delivery-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      await saveTelegramSettings(store, {
        botToken: "123456:ABCDEF_token",
        chatId: "-1001234567890",
      });
      await saveFeishuSettings(
        store,
        "https://open.feishu.cn/open-apis/bot/v2/hook/abcdef",
      );

      expect(await getTelegramSettings(store)).toEqual({
        botToken: "123456:ABCDEF_token",
        chatId: "-1001234567890",
        updatedAt: expect.any(String),
      });
      expect(await getFeishuSettings(store)).toEqual({
        endpoint: "https://open.feishu.cn/open-apis/bot/v2/hook/abcdef",
        updatedAt: expect.any(String),
      });
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("persists delivery logs for a brief", async () => {
    const fixture = await seedBriefFixture();

    try {
      const logId = await createDeliveryLog(fixture.store, {
        briefId: fixture.briefId,
        endpoint: "https://example.com/webhook",
        payloadType: "html",
      });

      await finishDeliveryLog(fixture.store, {
        logId,
        status: "success",
        attemptCount: 2,
        responseStatus: 202,
      });

      expect(await listRecentDeliveryLogsByBrief(fixture.store, fixture.briefId)).toEqual([
        expect.objectContaining({
          briefId: fixture.briefId,
          status: "success",
          attemptCount: 2,
          responseStatus: 202,
        }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("validates webhook URLs as https-only", async () => {
    const parsed = webhookEndpointSchema.safeParse("http://example.com/hook");

    expect(parsed.success).toBe(false);
  });

  it("summarizes delivery health by status and configured channels", async () => {
    const fixture = await seedBriefFixture();

    try {
      await saveWebhookSettings(fixture.store, "https://example.com/webhook");
      await saveSlackSettings(
        fixture.store,
        "https://hooks.slack.com/services/T/B/X",
      );
      await saveTelegramSettings(fixture.store, {
        botToken: "123456:ABCDEF_token",
        chatId: "-1001234567890",
      });
      await saveFeishuSettings(
        fixture.store,
        "https://open.feishu.cn/open-apis/bot/v2/hook/abcdef",
      );

      const successLogId = await createDeliveryLog(fixture.store, {
        briefId: fixture.briefId,
        endpoint: "https://example.com/webhook",
        payloadType: "html",
      });
      await finishDeliveryLog(fixture.store, {
        logId: successLogId,
        status: "success",
        responseStatus: 202,
      });

      const failedLogId = await createDeliveryLog(fixture.store, {
        briefId: fixture.briefId,
        endpoint: "https://hooks.slack.com/services/T/B/X",
        payloadType: "slack",
      });
      await finishDeliveryLog(fixture.store, {
        logId: failedLogId,
        status: "error",
        error: "boom",
      });

      expect(await getDeliveryHealthSummary(fixture.store)).toEqual({
        total: 2,
        success: 1,
        error: 1,
        running: 0,
        webhookConfigured: true,
        slackConfigured: true,
        telegramConfigured: true,
        feishuConfigured: true,
      });
    } finally {
      fixture.cleanup();
    }
  });
});

describe("store brief queries", () => {
  it("retrieves a brief by id with space and task context", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, { name: "AI Watch" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Agent launches",
        taskType: "TOPIC",
        userPrompt: "Track launches",
      });
      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Feed",
        url: "https://example.com/feed.xml",
      });

      await createItemRecord(store, {
        sourceId,
        title: "Launch roundup",
        canonicalUrl: "https://example.com/launch",
        summary: "Latest launches.",
        rawContent: "Latest launches.",
        origin: "example.com",
        language: "en",
        structuredFields: { category: "launch" },
        publishedAt: "2026-05-21T08:00:00.000Z",
      });

      const itemRows = store.database
        .prepare("SELECT id FROM items WHERE source_id = ?")
        .all(sourceId) as Array<{ id: string }>;

      const briefId = await createBriefRecord(store, {
        taskId,
        itemIds: [itemRows[0].id],
        title: "Launch roundup",
        summary: "Latest launches.",
        whyItMatters: "New signal.",
        sourceCitations: ["https://example.com/launch"],
      });

      const brief = await getBriefById(store, briefId);
      expect(brief).toMatchObject({
        id: briefId,
        taskId,
        title: "Launch roundup",
        spaceName: "AI Watch",
        taskTitle: "Agent launches",
      });

      expect(await getBriefById(store, "nonexistent")).toBeNull();
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("lists brief item ids and checks existence", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, { name: "Space" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Task",
        taskType: "TOPIC",
        userPrompt: "Prompt",
      });
      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Feed",
        url: "https://example.com/feed.xml",
      });

      await createItemRecord(store, {
        sourceId,
        title: "Item A",
        canonicalUrl: "https://example.com/a",
      });
      await createItemRecord(store, {
        sourceId,
        title: "Item B",
        canonicalUrl: "https://example.com/b",
      });

      const itemRows = store.database
        .prepare("SELECT id FROM items WHERE source_id = ? ORDER BY created_at")
        .all(sourceId) as Array<{ id: string }>;

      const briefId = await createBriefRecord(store, {
        taskId,
        itemIds: [itemRows[0].id, itemRows[1].id],
        title: "Combined brief",
        summary: "Two items.",
        whyItMatters: "Signal.",
        sourceCitations: ["https://example.com/a", "https://example.com/b"],
      });

      expect(await listBriefItemIds(store, briefId)).toHaveLength(2);
      expect(await listBriefItemIds(store, briefId)).toEqual(
        expect.arrayContaining([itemRows[0].id, itemRows[1].id]),
      );
      expect(await listBriefItemIds(store, "nonexistent")).toEqual([]);

      expect(await briefExistsForItem(store, itemRows[0].id)).toBe(true);
      expect(await briefExistsForItem(store, itemRows[1].id)).toBe(true);
      expect(await briefExistsForItem(store, "no-such-item")).toBe(false);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("lists linked item records for a brief", async () => {
    const fixture = await seedBriefFixture();

    try {
      const items = await listItemsByBriefId(fixture.store, fixture.briefId);

      expect(items).toEqual([
        expect.objectContaining({
          id: fixture.itemId,
          canonicalUrl: "https://example.com/a",
        }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });
});

async function seedBriefFixture() {
  const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
  const store = createStore(join(tempDirectory, "store.sqlite"));

  const spaceId = await createSpaceRecord(store, { name: "AI Watch" });
  const taskId = await createTaskRecord(store, {
    spaceId,
    title: "Agent launches",
    taskType: "TOPIC",
    userPrompt: "Track launches",
  });
  const sourceId = await createSourceRecord(store, {
    taskId,
    sourceType: "RSS",
    title: "Feed",
    url: "https://example.com/feed.xml",
  });

  await createItemRecord(store, {
    sourceId,
    title: "Item A",
    canonicalUrl: "https://example.com/a",
  });

  const itemRows = store.database
    .prepare("SELECT id FROM items WHERE source_id = ?")
    .all(sourceId) as Array<{ id: string }>;

  const briefId = await createBriefRecord(store, {
    taskId,
    itemIds: [itemRows[0].id],
    title: "Brief A",
    summary: "Summary A.",
    whyItMatters: "Signal.",
    sourceCitations: ["https://example.com/a"],
  });

  return {
    store,
    tempDirectory,
    spaceId,
    taskId,
    sourceId,
    briefId,
    itemId: itemRows[0].id,
    cleanup: () => {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}

describe("read/unread and filtered briefs", () => {
  it("marks a brief as read and unread", async () => {
    const fixture = await seedBriefFixture();

    try {
      const brief = await getBriefById(fixture.store, fixture.briefId);
      expect(brief?.isRead).toBe(false);

      await markBriefRead(fixture.store, fixture.briefId);
      expect((await getBriefById(fixture.store, fixture.briefId))?.isRead).toBe(
        true,
      );

      await markBriefUnread(fixture.store, fixture.briefId);
      expect((await getBriefById(fixture.store, fixture.briefId))?.isRead).toBe(
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("counts unread briefs", async () => {
    const fixture = await seedBriefFixture();

    try {
      expect(await countUnreadBriefs(fixture.store)).toBe(1);

      await markBriefRead(fixture.store, fixture.briefId);
      expect(await countUnreadBriefs(fixture.store)).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("filters briefs by task and unread status", async () => {
    const fixture = await seedBriefFixture();

    try {
      // All briefs
      expect(await listBriefsFiltered(fixture.store)).toHaveLength(1);

      // By task
      expect(
        await listBriefsFiltered(fixture.store, { taskId: fixture.taskId }),
      ).toHaveLength(1);
      expect(
        await listBriefsFiltered(fixture.store, { taskId: "nonexistent" }),
      ).toHaveLength(0);

      // Unread only
      expect(
        await listBriefsFiltered(fixture.store, { unreadOnly: true }),
      ).toHaveLength(1);

      await markBriefRead(fixture.store, fixture.briefId);
      expect(
        await listBriefsFiltered(fixture.store, { unreadOnly: true }),
      ).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("tracks read state per actor without leaking across members", async () => {
    const fixture = await seedBriefFixture();

    try {
      await addSpaceMember(fixture.store, {
        spaceId: fixture.spaceId,
        userId: "member-1",
        role: "viewer",
      });

      expect(
        (await getBriefById(fixture.store, fixture.briefId, { actorId: "local-user" }))
          ?.isRead,
      ).toBe(false);
      expect(
        (await getBriefById(fixture.store, fixture.briefId, { actorId: "member-1" }))
          ?.isRead,
      ).toBe(false);

      await markBriefRead(fixture.store, fixture.briefId, "local-user");

      expect(
        (await getBriefById(fixture.store, fixture.briefId, { actorId: "local-user" }))
          ?.isRead,
      ).toBe(true);
      expect(
        (await getBriefById(fixture.store, fixture.briefId, { actorId: "member-1" }))
          ?.isRead,
      ).toBe(false);

      await markBriefUnread(fixture.store, fixture.briefId, "local-user");

      expect(
        (await getBriefById(fixture.store, fixture.briefId, { actorId: "local-user" }))
          ?.isRead,
      ).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("counts unread briefs per actor membership state", async () => {
    const fixture = await seedBriefFixture();

    try {
      await addSpaceMember(fixture.store, {
        spaceId: fixture.spaceId,
        userId: "member-1",
        role: "viewer",
      });

      expect(
        await countUnreadBriefs(fixture.store, { actorId: "local-user" }),
      ).toBe(1);
      expect(
        await countUnreadBriefs(fixture.store, { actorId: "member-1" }),
      ).toBe(1);

      await markBriefRead(fixture.store, fixture.briefId, "local-user");

      expect(
        await countUnreadBriefs(fixture.store, { actorId: "local-user" }),
      ).toBe(0);
      expect(
        await countUnreadBriefs(fixture.store, { actorId: "member-1" }),
      ).toBe(1);
      expect(
        await listBriefsFiltered(fixture.store, {
          actorId: "local-user",
          unreadOnly: true,
        }),
      ).toHaveLength(0);
      expect(
        await listBriefsFiltered(fixture.store, {
          actorId: "member-1",
          unreadOnly: true,
        }),
      ).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("orders briefs by importance then relevance then recency", async () => {
    const fixture = await seedBriefFixture();

    try {
      const secondBriefId = await createBriefRecord(fixture.store, {
        taskId: fixture.taskId,
        itemIds: [],
        title: "Higher priority brief",
        summary: "Summary B.",
        whyItMatters: "Higher priority signal.",
        sourceCitations: ["https://example.com/b"],
        importanceScore: 0.9,
        relevanceScore: 0.6,
      });

      const thirdBriefId = await createBriefRecord(fixture.store, {
        taskId: fixture.taskId,
        itemIds: [],
        title: "High relevance but lower importance",
        summary: "Summary C.",
        whyItMatters: "Lower priority signal.",
        sourceCitations: ["https://example.com/c"],
        importanceScore: 0.7,
        relevanceScore: 0.95,
      });

      const briefs = await listBriefsFiltered(fixture.store);

      expect(briefs.map((brief) => brief.id)).toEqual([
        secondBriefId,
        thirdBriefId,
        fixture.briefId,
      ]);
    } finally {
      fixture.cleanup();
    }
  });
});

describe("cascade deletes", () => {
  it("deletes a brief", async () => {
    const fixture = await seedBriefFixture();

    try {
      await deleteBrief(fixture.store, fixture.briefId);
      expect(await getBriefById(fixture.store, fixture.briefId)).toBeNull();
      // Item should still exist
      expect(await briefExistsForItem(fixture.store, fixture.itemId)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("deletes a source and cascades to items and brief_items", async () => {
    const fixture = await seedBriefFixture();

    try {
      await deleteSource(fixture.store, fixture.sourceId);
      expect(await listSources(fixture.store)).toHaveLength(0);
      // Brief should still exist (its brief_items orphaned, but CASCADE on items removes brief_items)
      expect(await listBriefItemIds(fixture.store, fixture.briefId)).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("deletes a task and cascades to sources, items, and briefs", async () => {
    const fixture = await seedBriefFixture();

    try {
      await deleteTask(fixture.store, fixture.taskId);
      expect(await listSources(fixture.store)).toHaveLength(0);
      expect(await getBriefById(fixture.store, fixture.briefId)).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  it("deletes a space and cascades everything downstream", async () => {
    const fixture = await seedBriefFixture();

    try {
      await deleteSpace(fixture.store, fixture.spaceId);
      expect(await listSources(fixture.store)).toHaveLength(0);
      expect(await getBriefById(fixture.store, fixture.briefId)).toBeNull();
      expect(await hasTaskRecord(fixture.store, fixture.taskId)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });
});

describe("store expansions for AI features", () => {
  it("falls back to an existing prisma chat thread after a unique conflict", async () => {
    const existingThread = {
      id: "thread-1",
      scopeType: "brief",
      scopeId: "brief-1:actor:user-1",
      createdAt: new Date("2026-05-23T00:00:00.000Z"),
    };
    const store = {
      runtime: "prisma",
      database: {} as DatabaseSync,
      prisma: {
        chatThread: {
          upsert: vi.fn().mockRejectedValue({ code: "P2002" }),
          findUnique: vi.fn().mockResolvedValue(existingThread),
        },
      },
    } as unknown as Store;

    await expect(
      getOrCreateChatThread(store, "brief", "brief-1:actor:user-1"),
    ).resolves.toEqual({
      id: "thread-1",
      scopeType: "brief",
      scopeId: "brief-1:actor:user-1",
      createdAt: "2026-05-23T00:00:00.000Z",
    });
  });

  it("stores enriched item metadata", async () => {
    const fixture = await seedBriefFixture();

    try {
      const itemId = await createItemRecordResult(fixture.store, {
        sourceId: fixture.sourceId,
        title: "Launch roundup",
        canonicalUrl: "https://example.com/launch",
        summary: "Latest launches.",
        rawContent: "Launch details and context.",
        origin: "example.com",
        language: "en",
        structuredFields: { company: "OpenAI" },
        publishedAt: "2026-05-21T08:00:00.000Z",
        fetchedAt: "2026-05-22T08:00:00.000Z",
      });

      expect(itemId).not.toBeNull();
      expect(await listItemsBySource(fixture.store, fixture.sourceId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rawContent: "Launch details and context.",
            origin: "example.com",
            language: "en",
            structuredFields: { company: "OpenAI" },
            fetchedAt: "2026-05-22T08:00:00.000Z",
          }),
        ]),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("saves and retrieves task profiles", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-expansion-test-"));
    const filename = join(tempDirectory, "store.sqlite");
    const store = createStore(filename);
    let reopenedStore: Store | null = null;
    let originalStoreClosed = false;

    try {
      const spaceId = await createSpaceRecord(store, { name: "AI Dev" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Coding Agents",
        taskType: "TOPIC",
        userPrompt: "Follow AI coding assistant news",
      });

      const originalProfile = await getTaskProfile(store, taskId);
      expect(originalProfile).toBeNull();

      const newProfile = {
        keywords: ["ai", "agents", "codegen"],
        suggestedQueries: ["cursor agent", "devin release"],
      };

      await saveTaskProfile(store, taskId, newProfile);
      store.database.close();
      originalStoreClosed = true;

      reopenedStore = createStore(filename);
      const retrieved = await getTaskProfile(reopenedStore, taskId);
      expect(retrieved).toEqual(newProfile);

      const task = await getTaskById(reopenedStore, taskId);
      expect(task?.taskProfile).toEqual(newProfile);
    } finally {
      reopenedStore?.database.close();
      if (!originalStoreClosed) {
        store.database.close();
      }
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("updates task controls", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-expansion-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, { name: "AI Dev" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Coding Agents",
        taskType: "TOPIC",
        userPrompt: "Follow AI coding assistant news",
      });

      const initial = await getTaskById(store, taskId);
      expect(initial?.relevanceLevel).toBe(3);
      expect(initial?.summaryPreference).toBe("balanced");

      await updateTaskControls(store, taskId, 5, "detailed");
      const updated = await getTaskById(store, taskId);
      expect(updated?.relevanceLevel).toBe(5);
      expect(updated?.summaryPreference).toBe("detailed");
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("manages chat threads and messages with citations and provenance", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-expansion-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const thread = await getOrCreateChatThread(store, "task", "task-123");
      expect(thread.scopeType).toBe("task");
      expect(thread.scopeId).toBe("task-123");
      expect(thread.id).toBeDefined();

      const secondThread = await getOrCreateChatThread(store, "task", "task-123");
      expect(secondThread.id).toBe(thread.id);

      await createChatMessage(store, {
        threadId: thread.id,
        role: "user",
        content: "What is Devin?",
      });

      await createChatMessage(store, {
        threadId: thread.id,
        role: "assistant",
        content: "Devin is an autonomous AI software engineer.",
        citations: ["https://cognition.labs/blog/introducing-devin"],
        provenance: "mixed",
      });

      const messages = await listChatMessages(store, thread.id);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("What is Devin?");
      expect(messages[0].citations).toBeNull();
      expect(messages[0].provenance).toBeNull();

      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toBe("Devin is an autonomous AI software engineer.");
      expect(messages[1].citations).toEqual(["https://cognition.labs/blog/introducing-devin"]);
      expect(messages[1].provenance).toBe("mixed");
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("finds chat threads without creating them", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-expansion-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      expect(await findChatThread(store, "task", "task-456")).toBeNull();

      const thread = await getOrCreateChatThread(store, "task", "task-456");
      expect((await findChatThread(store, "task", "task-456"))?.id).toBe(
        thread.id,
      );
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
