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
  createSpaceRecord,
  createStore,
  createTaskRecord,
  deleteBrief,
  deleteSource,
  deleteSpace,
  deleteTask,
  getBriefById,
  findChatThread,
  hasTaskRecord,
  listBriefItemIds,
  listBriefsFiltered,
  listItemsByBriefId,
  listItemsBySource,
  listSources,
  listSourcesByTask,
  markBriefRead,
  markBriefUnread,
  getTaskById,
  getTaskProfile,
  saveTaskProfile,
  updateTaskControls,
  getOrCreateChatThread,
  createChatMessage,
  listChatMessages,
} from "@/lib/store";
import { createSourceSchema } from "@/lib/validation";

describe("store source persistence", () => {
  it("rejects non-http source URLs", () => {
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

  it("lists RSS sources by task from an isolated database", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = createSpaceRecord(store, {
        name: "OpenAI",
      });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Monitor feed",
        taskType: "TOPIC",
        userPrompt: "Track RSS updates",
      });

      createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });

      expect(listSourcesByTask(store, taskId)).toEqual([
        expect.objectContaining({
          taskId,
          sourceType: "RSS",
          title: "OpenAI News",
          url: "https://example.com/feed.xml",
          status: "idle",
        }),
      ]);
      expect(listSources(store)).toEqual([
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

  it("stores UPDATE and NEWSLETTER sources under a task", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = createSpaceRecord(store, {
        name: "OpenAI",
      });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Monitor updates",
        taskType: "TOPIC",
        userPrompt: "Track changelogs and newsletter archives",
      });

      createSourceRecord(store, {
        taskId,
        sourceType: "UPDATE",
        title: "OpenAI Changelog",
        url: "https://openai.com/changelog",
      });
      createSourceRecord(store, {
        taskId,
        sourceType: "NEWSLETTER",
        title: "Agent Archive",
        url: "https://example.com/archive",
      });

      expect(listSourcesByTask(store, taskId)).toEqual(
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

  it("rejects newsletter archive sources without https", () => {
    const parsed = createSourceSchema.safeParse({
      taskId: "task-123",
      sourceType: "NEWSLETTER",
      title: "Archive",
      url: "http://localhost/archive",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Enter a valid https URL.");
  });

  it("migrates an existing sources table to enforce valid status values", () => {
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
      const spaceId = createSpaceRecord(store, {
        name: "Migrated space",
      });
      const taskId = createTaskRecord(store, {
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

  it("rejects stale task ids after the task has been removed", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = createSpaceRecord(store, {
        name: "OpenAI",
      });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Monitor feed",
        taskType: "TOPIC",
        userPrompt: "Track RSS updates",
      });

      store.database.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

      expect(hasTaskRecord(store, taskId)).toBe(false);
      expect(() =>
        createSourceRecord(store, {
          taskId,
          sourceType: "RSS",
          title: "OpenAI News",
          url: "https://example.com/feed.xml",
        }),
      ).toThrow();
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

describe("store brief queries", () => {
  it("retrieves a brief by id with space and task context", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = createSpaceRecord(store, { name: "AI Watch" });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Agent launches",
        taskType: "TOPIC",
        userPrompt: "Track launches",
      });
      const sourceId = createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Feed",
        url: "https://example.com/feed.xml",
      });

      createItemRecord(store, {
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

      const briefId = createBriefRecord(store, {
        taskId,
        itemIds: [itemRows[0].id],
        title: "Launch roundup",
        summary: "Latest launches.",
        whyItMatters: "New signal.",
        sourceCitations: ["https://example.com/launch"],
      });

      const brief = getBriefById(store, briefId);
      expect(brief).toMatchObject({
        id: briefId,
        taskId,
        title: "Launch roundup",
        spaceName: "AI Watch",
        taskTitle: "Agent launches",
      });

      expect(getBriefById(store, "nonexistent")).toBeNull();
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("lists brief item ids and checks existence", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = createSpaceRecord(store, { name: "Space" });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Task",
        taskType: "TOPIC",
        userPrompt: "Prompt",
      });
      const sourceId = createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Feed",
        url: "https://example.com/feed.xml",
      });

      createItemRecord(store, {
        sourceId,
        title: "Item A",
        canonicalUrl: "https://example.com/a",
      });
      createItemRecord(store, {
        sourceId,
        title: "Item B",
        canonicalUrl: "https://example.com/b",
      });

      const itemRows = store.database
        .prepare("SELECT id FROM items WHERE source_id = ? ORDER BY created_at")
        .all(sourceId) as Array<{ id: string }>;

      const briefId = createBriefRecord(store, {
        taskId,
        itemIds: [itemRows[0].id, itemRows[1].id],
        title: "Combined brief",
        summary: "Two items.",
        whyItMatters: "Signal.",
        sourceCitations: ["https://example.com/a", "https://example.com/b"],
      });

      expect(listBriefItemIds(store, briefId)).toHaveLength(2);
      expect(listBriefItemIds(store, briefId)).toEqual(
        expect.arrayContaining([itemRows[0].id, itemRows[1].id]),
      );
      expect(listBriefItemIds(store, "nonexistent")).toEqual([]);

      expect(briefExistsForItem(store, itemRows[0].id)).toBe(true);
      expect(briefExistsForItem(store, itemRows[1].id)).toBe(true);
      expect(briefExistsForItem(store, "no-such-item")).toBe(false);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("lists linked item records for a brief", () => {
    const fixture = seedBriefFixture();

    try {
      const items = listItemsByBriefId(fixture.store, fixture.briefId);

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

function seedBriefFixture() {
  const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
  const store = createStore(join(tempDirectory, "store.sqlite"));

  const spaceId = createSpaceRecord(store, { name: "AI Watch" });
  const taskId = createTaskRecord(store, {
    spaceId,
    title: "Agent launches",
    taskType: "TOPIC",
    userPrompt: "Track launches",
  });
  const sourceId = createSourceRecord(store, {
    taskId,
    sourceType: "RSS",
    title: "Feed",
    url: "https://example.com/feed.xml",
  });

  createItemRecord(store, {
    sourceId,
    title: "Item A",
    canonicalUrl: "https://example.com/a",
  });

  const itemRows = store.database
    .prepare("SELECT id FROM items WHERE source_id = ?")
    .all(sourceId) as Array<{ id: string }>;

  const briefId = createBriefRecord(store, {
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
  it("marks a brief as read and unread", () => {
    const fixture = seedBriefFixture();

    try {
      const brief = getBriefById(fixture.store, fixture.briefId);
      expect(brief?.isRead).toBe(false);

      markBriefRead(fixture.store, fixture.briefId);
      expect(getBriefById(fixture.store, fixture.briefId)?.isRead).toBe(true);

      markBriefUnread(fixture.store, fixture.briefId);
      expect(getBriefById(fixture.store, fixture.briefId)?.isRead).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("counts unread briefs", () => {
    const fixture = seedBriefFixture();

    try {
      expect(countUnreadBriefs(fixture.store)).toBe(1);

      markBriefRead(fixture.store, fixture.briefId);
      expect(countUnreadBriefs(fixture.store)).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("filters briefs by task and unread status", () => {
    const fixture = seedBriefFixture();

    try {
      // All briefs
      expect(listBriefsFiltered(fixture.store)).toHaveLength(1);

      // By task
      expect(
        listBriefsFiltered(fixture.store, { taskId: fixture.taskId }),
      ).toHaveLength(1);
      expect(
        listBriefsFiltered(fixture.store, { taskId: "nonexistent" }),
      ).toHaveLength(0);

      // Unread only
      expect(
        listBriefsFiltered(fixture.store, { unreadOnly: true }),
      ).toHaveLength(1);

      markBriefRead(fixture.store, fixture.briefId);
      expect(
        listBriefsFiltered(fixture.store, { unreadOnly: true }),
      ).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });
});

describe("cascade deletes", () => {
  it("deletes a brief", () => {
    const fixture = seedBriefFixture();

    try {
      deleteBrief(fixture.store, fixture.briefId);
      expect(getBriefById(fixture.store, fixture.briefId)).toBeNull();
      // Item should still exist
      expect(briefExistsForItem(fixture.store, fixture.itemId)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("deletes a source and cascades to items and brief_items", () => {
    const fixture = seedBriefFixture();

    try {
      deleteSource(fixture.store, fixture.sourceId);
      expect(listSources(fixture.store)).toHaveLength(0);
      // Brief should still exist (its brief_items orphaned, but CASCADE on items removes brief_items)
      expect(listBriefItemIds(fixture.store, fixture.briefId)).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("deletes a task and cascades to sources, items, and briefs", () => {
    const fixture = seedBriefFixture();

    try {
      deleteTask(fixture.store, fixture.taskId);
      expect(listSources(fixture.store)).toHaveLength(0);
      expect(getBriefById(fixture.store, fixture.briefId)).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  it("deletes a space and cascades everything downstream", () => {
    const fixture = seedBriefFixture();

    try {
      deleteSpace(fixture.store, fixture.spaceId);
      expect(listSources(fixture.store)).toHaveLength(0);
      expect(getBriefById(fixture.store, fixture.briefId)).toBeNull();
      expect(hasTaskRecord(fixture.store, fixture.taskId)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });
});

describe("store expansions for AI features", () => {
  it("stores enriched item metadata", () => {
    const fixture = seedBriefFixture();

    try {
      const itemId = createItemRecordResult(fixture.store, {
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
      expect(listItemsBySource(fixture.store, fixture.sourceId)).toEqual(
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

  it("saves and retrieves task profiles", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-expansion-test-"));
    const filename = join(tempDirectory, "store.sqlite");
    const store = createStore(filename);
    let reopenedStore: ReturnType<typeof createStore> | null = null;
    let originalStoreClosed = false;

    try {
      const spaceId = createSpaceRecord(store, { name: "AI Dev" });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Coding Agents",
        taskType: "TOPIC",
        userPrompt: "Follow AI coding assistant news",
      });

      const originalProfile = getTaskProfile(store, taskId);
      expect(originalProfile).toBeNull();

      const newProfile = {
        keywords: ["ai", "agents", "codegen"],
        suggestedQueries: ["cursor agent", "devin release"],
      };

      saveTaskProfile(store, taskId, newProfile);
      store.database.close();
      originalStoreClosed = true;

      reopenedStore = createStore(filename);
      const retrieved = getTaskProfile(reopenedStore, taskId);
      expect(retrieved).toEqual(newProfile);

      const task = getTaskById(reopenedStore, taskId);
      expect(task?.taskProfile).toEqual(newProfile);
    } finally {
      reopenedStore?.database.close();
      if (!originalStoreClosed) {
        store.database.close();
      }
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("updates task controls", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-expansion-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = createSpaceRecord(store, { name: "AI Dev" });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Coding Agents",
        taskType: "TOPIC",
        userPrompt: "Follow AI coding assistant news",
      });

      const initial = getTaskById(store, taskId);
      expect(initial?.relevanceLevel).toBe(3);
      expect(initial?.summaryPreference).toBe("balanced");

      updateTaskControls(store, taskId, 5, "detailed");
      const updated = getTaskById(store, taskId);
      expect(updated?.relevanceLevel).toBe(5);
      expect(updated?.summaryPreference).toBe("detailed");
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("manages chat threads and messages with citations and provenance", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-expansion-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const thread = getOrCreateChatThread(store, "task", "task-123");
      expect(thread.scopeType).toBe("task");
      expect(thread.scopeId).toBe("task-123");
      expect(thread.id).toBeDefined();

      const secondThread = getOrCreateChatThread(store, "task", "task-123");
      expect(secondThread.id).toBe(thread.id);

      createChatMessage(store, {
        threadId: thread.id,
        role: "user",
        content: "What is Devin?",
      });

      createChatMessage(store, {
        threadId: thread.id,
        role: "assistant",
        content: "Devin is an autonomous AI software engineer.",
        citations: ["https://cognition.labs/blog/introducing-devin"],
        provenance: "mixed",
      });

      const messages = listChatMessages(store, thread.id);
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

  it("finds chat threads without creating them", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-expansion-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      expect(findChatThread(store, "task", "task-456")).toBeNull();

      const thread = getOrCreateChatThread(store, "task", "task-456");
      expect(findChatThread(store, "task", "task-456")?.id).toBe(thread.id);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
