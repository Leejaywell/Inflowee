/// <reference types="vitest/globals" />

import { getBlockedSourceUrlError } from "@/app/actions";
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

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      title: "Launch roundup",
      canonicalUrl: "https://example.com/posts/launch-roundup",
    });
    expect(items[2]).toMatchObject({
      title: "Guid-only entry",
      canonicalUrl: "https://example.com/posts/guid-only-entry",
      publishedAt: "2026-05-21T09:15:00.000Z",
      summary: "Entry with only a GUID permalink.",
    });
  });

  it("returns canonical feed items from Atom xml with alternate links", () => {
    const xml = readFileSync(
      join(process.cwd(), "tests/fixtures/sample-atom-feed.xml"),
      "utf8",
    );

    const items = parseFeedItems(xml);

    expect(items).toEqual([
      expect.objectContaining({
        title: "Atom launch roundup",
        canonicalUrl: "https://example.com/posts/atom-launch-roundup",
        publishedAt: "2026-05-20T08:30:00.000Z",
        summary: "Atom summary content.",
      }),
      expect.objectContaining({
        title: "Fallback link entry",
        canonicalUrl: "https://example.com/posts/fallback-link",
        publishedAt: "2026-05-19T06:45:00.000Z",
        summary: "Fallback summary content. Second paragraph.",
      }),
    ]);
  });

  it("returns no items for feeds without usable links or guids", () => {
    const items = parseFeedItems(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Unsupported entry</title>
          <summary>No canonical URL is available here.</summary>
        </entry>
      </feed>
    `);

    expect(items).toEqual([]);
  });

  it("ignores guid urls when isPermaLink is explicitly false", () => {
    const items = parseFeedItems(`
      <rss version="2.0">
        <channel>
          <item>
            <title>Non permalink guid</title>
            <guid isPermaLink="false">https://example.com/posts/non-permalink-guid</guid>
            <description>Should be ignored.</description>
          </item>
        </channel>
      </rss>
    `);

    expect(items).toEqual([]);
  });

  it("blocks localhost and private source urls", () => {
    expect(getBlockedSourceUrlError("https://localhost/feed.xml")).toBe(
      "Source URL targets a blocked local or private address.",
    );
    expect(getBlockedSourceUrlError("https://127.0.0.1/feed.xml")).toBe(
      "Source URL targets a blocked local or private address.",
    );
    expect(getBlockedSourceUrlError("https://192.168.1.10/feed.xml")).toBe(
      "Source URL targets a blocked local or private address.",
    );
    expect(getBlockedSourceUrlError("https://example.com/feed.xml")).toBeNull();
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
