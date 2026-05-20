/// <reference types="vitest/globals" />

import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseFeedItems } from "@/lib/rss";
import {
  createItemRecord,
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  listItemsBySource,
  listSourcesByTask,
  markSourceSyncResult,
} from "@/lib/store";

describe("parseFeedItems", () => {
  it("returns canonical feed items from RSS xml", () => {
    const xml = readFileSync(
      join(process.cwd(), "tests/fixtures/sample-feed.xml"),
      "utf8",
    );

    const items = parseFeedItems(xml);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Launch roundup",
      canonicalUrl: "https://example.com/posts/launch-roundup",
    });
  });

  it("stores feed items per source and ignores duplicate canonical urls", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-rss-test-"));
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
      const sourceId = createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });

      expect(
        createItemRecord(store, {
          sourceId,
          title: "Older update",
          canonicalUrl: "https://example.com/posts/older-update",
          summary: "Older summary",
          publishedAt: "2026-05-19T16:00:00.000Z",
        }),
      ).toBe(true);
      expect(
        createItemRecord(store, {
          sourceId,
          title: "Launch roundup",
          canonicalUrl: "https://example.com/posts/launch-roundup",
          summary: "Launch summary",
          publishedAt: "2026-05-20T08:30:00.000Z",
        }),
      ).toBe(true);
      expect(
        createItemRecord(store, {
          sourceId,
          title: "Duplicate launch roundup",
          canonicalUrl: "https://example.com/posts/launch-roundup",
          summary: "Duplicate summary",
          publishedAt: "2026-05-20T08:30:00.000Z",
        }),
      ).toBe(false);

      expect(listItemsBySource(store, sourceId)).toEqual([
        expect.objectContaining({
          sourceId,
          title: "Launch roundup",
          canonicalUrl: "https://example.com/posts/launch-roundup",
          summary: "Launch summary",
          publishedAt: "2026-05-20T08:30:00.000Z",
        }),
        expect.objectContaining({
          sourceId,
          title: "Older update",
          canonicalUrl: "https://example.com/posts/older-update",
          summary: "Older summary",
          publishedAt: "2026-05-19T16:00:00.000Z",
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("marks source sync results with status and error details", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-rss-test-"));
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
      const sourceId = createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });

      markSourceSyncResult(store, {
        sourceId,
        status: "error",
        error: "Feed request failed with 500",
      });

      expect(listSourcesByTask(store, taskId)).toEqual([
        expect.objectContaining({
          id: sourceId,
          status: "error",
          lastError: "Feed request failed with 500",
          lastSyncedAt: expect.any(String),
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
