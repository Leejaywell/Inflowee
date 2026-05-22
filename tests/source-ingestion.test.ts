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
  listRecentSyncRunsBySource,
  listBriefs,
  listItemsBySource,
  listSourcesByTask,
} from "@/lib/store";
import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";

describe("syncSourceById", () => {
  it("ingests a real feed into items and briefs", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-sync-test-"));
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

      expect(await listItemsBySource(store, sourceId)).toHaveLength(1);
      expect(await listBriefs(store)).toEqual([
        expect.objectContaining({
          taskId,
          title: "Launch roundup",
          summary: "Latest launches and product updates.",
          sourceCitations: ["https://example.com/posts/launch-roundup"],
        }),
      ]);
      expect(await listSourcesByTask(store, taskId)).toEqual([
        expect.objectContaining({
          id: sourceId,
          status: "success",
          lastError: null,
          lastSyncedAt: expect.any(String),
        }),
      ]);
      expect(await listRecentSyncRunsBySource(store, sourceId)).toEqual([
        expect.objectContaining({
          sourceId,
          status: "success",
          insertedItemCount: 1,
          createdBriefCount: 1,
          finishedAt: expect.any(String),
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

      expect(await listBriefs(store)).toHaveLength(1);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "ingests a feed into items and briefs through the postgres-backed store",
    async () => {
    const fixture = await createIsolatedPostgresStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "OpenAI",
      });
      const taskId = await createTaskRecord(fixture.store, {
        spaceId,
        title: "Monitor feed",
        taskType: "TOPIC",
        userPrompt: "Track RSS updates",
      });
      const sourceId = await createSourceRecord(fixture.store, {
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
      const result = await syncSourceById(fixture.store, sourceId, {
        fetchSourceFeedImpl: vi.fn().mockResolvedValue(xml),
      });

      expect(result).toMatchObject({
        ok: true,
        insertedItemCount: 1,
        createdBriefCount: 1,
      });
      expect(await listItemsBySource(fixture.store, sourceId)).toHaveLength(1);
      expect(await listBriefs(fixture.store)).toEqual([
        expect.objectContaining({
          taskId,
          title: "Launch roundup",
        }),
      ]);
    } finally {
      await fixture.cleanup();
    }
  }, 15_000);

  it("ingests update sources into items and briefs", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-sync-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, { name: "OpenAI" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Monitor updates",
        taskType: "TOPIC",
        userPrompt: "Track changelog updates",
      });
      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "UPDATE",
        title: "Changelog",
        url: "https://example.com/changelog",
      });

      const html = `
        <html>
          <body>
            <section>
              <h2>Added task intelligence refresh</h2>
              <a href="#2026-05-22">Permalink</a>
              <p>Task recommendations can now be refreshed on demand.</p>
            </section>
          </body>
        </html>
      `;
      const result = await syncSourceById(store, sourceId, {
        fetchSourceFeedImpl: vi.fn().mockResolvedValue(html),
      });

      expect(result).toMatchObject({
        ok: true,
        insertedItemCount: 1,
        createdBriefCount: 1,
      });
      expect(await listItemsBySource(store, sourceId)).toHaveLength(1);
      expect((await listBriefs(store))[0]).toMatchObject({
        taskId,
        title: "Added task intelligence refresh",
      });
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
    },
  );

  it("ingests newsletter archive sources into items and briefs", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-sync-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, { name: "AI Watch" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Monitor archives",
        taskType: "TOPIC",
        userPrompt: "Track newsletter archives",
      });
      const sourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "NEWSLETTER",
        title: "Archive",
        url: "https://example.com/archive",
      });

      const html = `
        <html>
          <body>
            <article>
              <h2>This Week In Agents #12</h2>
              <a href="/archive/week-12">Read issue</a>
              <p>OpenAI, Cursor, and Devin all shipped updates this week.</p>
            </article>
          </body>
        </html>
      `;
      const result = await syncSourceById(store, sourceId, {
        fetchSourceFeedImpl: vi.fn().mockResolvedValue(html),
      });

      expect(result).toMatchObject({
        ok: true,
        insertedItemCount: 1,
        createdBriefCount: 1,
      });
      expect(await listItemsBySource(store, sourceId)).toHaveLength(1);
      expect((await listBriefs(store))[0]).toMatchObject({
        taskId,
        title: "This Week In Agents #12",
      });
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
      const spaceId = await createSpaceRecord(store, { name: "Space" });
      const taskId = await createTaskRecord(store, {
        spaceId,
        title: "Task",
        taskType: "TOPIC",
        userPrompt: "Prompt",
      });

      // Healthy source
      const healthySourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Healthy",
        url: "https://example.com/healthy.xml",
      });

      // Errored source
      const errorSourceId = await createSourceRecord(store, {
        taskId,
        sourceType: "RSS",
        title: "Errored",
        url: "https://example.com/errored.xml",
      });
      // Force it to have "error" status
      const { markSourceSyncResult } = await import("@/lib/store");
      await markSourceSyncResult(store, {
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
