/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { syncAllSources, syncSourceById } from "@/lib/source-ingestion";
import {
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  listBriefs,
  listItemsBySource,
  listSourcesByTask,
} from "@/lib/store";

describe("syncSourceById", () => {
  it("ingests a real feed into items and briefs", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-sync-test-"));
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
        title: "Example feed",
        url: "https://example.com/feed.xml",
      });

      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title>Launch roundup</title>
              <link>https://example.com/posts/launch-roundup</link>
              <description>Latest launches and product updates.</description>
              <pubDate>Wed, 21 May 2026 08:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>
      `;
      const result = await syncSourceById(store, sourceId, {
        fetchSourceFeedImpl: vi.fn().mockResolvedValue(xml),
      });

      expect(result).toMatchObject({
        ok: true,
        insertedItemCount: 1,
        createdBriefCount: 1,
      });

      expect(listItemsBySource(store, sourceId)).toHaveLength(1);
      expect(listBriefs(store)).toEqual([
        expect.objectContaining({
          taskId,
          title: "Launch roundup",
          summary: "Latest launches and product updates.",
          sourceCitations: ["https://example.com/posts/launch-roundup"],
        }),
      ]);
      expect(listSourcesByTask(store, taskId)).toEqual([
        expect.objectContaining({
          id: sourceId,
          status: "success",
          lastError: null,
          lastSyncedAt: expect.any(String),
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("does not create duplicate briefs when re-syncing", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-sync-test-"));
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

      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title>Post A</title>
              <link>https://example.com/a</link>
              <description>Content A</description>
            </item>
          </channel>
        </rss>
      `;
      const fetchImpl = vi.fn().mockResolvedValue(xml);

      const first = await syncSourceById(store, sourceId, {
        fetchSourceFeedImpl: fetchImpl,
      });
      expect(first).toMatchObject({ ok: true, createdBriefCount: 1 });

      const second = await syncSourceById(store, sourceId, {
        fetchSourceFeedImpl: fetchImpl,
      });
      expect(second).toMatchObject({ ok: true, createdBriefCount: 0 });

      expect(listBriefs(store)).toHaveLength(1);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

describe("syncAllSources", () => {
  it("syncs multiple non-error sources and skips error sources", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-sync-all-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = createSpaceRecord(store, { name: "Space" });
      const taskId = createTaskRecord(store, {
        spaceId,
        title: "Task",
        taskType: "TOPIC",
        userPrompt: "Prompt",
      });

      // Healthy source
      const healthySourceId = createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Healthy",
        url: "https://example.com/healthy.xml",
      });

      // Errored source
      const errorSourceId = createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Errored",
        url: "https://example.com/errored.xml",
      });
      // Force it to have "error" status
      const { markSourceSyncResult } = await import("@/lib/store");
      markSourceSyncResult(store, {
        sourceId: errorSourceId,
        status: "error",
        error: "Failed to connect",
      });

      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title>Healthy post</title>
              <link>https://example.com/healthy/1</link>
              <description>Content</description>
            </item>
          </channel>
        </rss>
      `;
      const fetchImpl = vi.fn().mockResolvedValue(xml);

      const result = await syncAllSources(store, {
        fetchSourceFeedImpl: fetchImpl,
      });

      expect(result).toMatchObject({
        synced: 1,
        failed: 0,
        skipped: 1,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        ok: true,
        source: expect.objectContaining({ id: healthySourceId }),
      });
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

