/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  briefExistsForItem,
  countUnreadBriefs,
  createBriefRecord,
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
  findChatThread,
  getWebhookSettings,
  hasTaskRecord,
  listBriefItemIds,
  listBriefsFiltered,
  listRecentDeliveryLogsByBrief,
  listItemsByBriefId,
  listItemsBySource,
  listRecentSyncRunsBySource,
  listSources,
  listSpacesWithTasks,
  listSourcesByTask,
  markBriefRead,
  markBriefUnread,
  getSourceById,
  getTaskById,
  getTaskProfile,
  saveWebhookSettings,
  saveTaskProfile,
  finishSyncRun,
  updateTaskControls,
  getOrCreateChatThread,
  createChatMessage,
  listChatMessages,
  type Store,
} from "@/lib/store";
import {
  createSourceSchema,
  updateSourceScheduleSchema,
  webhookEndpointSchema,
} from "@/lib/validation";
import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";

describe("store promise contract", () => {
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

  it("stores UPDATE and NEWSLETTER sources under a task", async () => {
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
        responseStatus: 202,
      });

      expect(await listRecentDeliveryLogsByBrief(fixture.store, fixture.briefId)).toEqual([
        expect.objectContaining({
          briefId: fixture.briefId,
          status: "success",
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
