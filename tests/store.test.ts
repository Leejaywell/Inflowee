/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  listSourcesByTask,
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
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
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
});
