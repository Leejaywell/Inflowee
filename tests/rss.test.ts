/// <reference types="vitest/globals" />

import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseFeedItems } from "@/lib/rss";
import {
  fetchSourceFeed,
  getBlockedSourceUrlError,
  getResolvedSourceUrlError,
} from "@/lib/source-sync";
import {
  createItemRecord,
  createSourceRecord,
  createStore,
  createTopicRecord,
  listItemsBySource,
  listSourcesByTopic,
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

  it("blocks IPv6 literal localhost and private source urls", () => {
    expect(getBlockedSourceUrlError("https://[::1]/feed.xml")).toBe(
      "Source URL targets a blocked local or private address.",
    );
    expect(getBlockedSourceUrlError("https://[::ffff:127.0.0.1]/feed.xml")).toBe(
      "Source URL targets a blocked local or private address.",
    );
    expect(getBlockedSourceUrlError("https://[fc00::1]/feed.xml")).toBe(
      "Source URL targets a blocked local or private address.",
    );
    expect(getBlockedSourceUrlError("https://[fe80::1]/feed.xml")).toBe(
      "Source URL targets a blocked local or private address.",
    );
    expect(getBlockedSourceUrlError("https://[2001:db8::1]/feed.xml")).toBeNull();
  });

  it("ignores relative or non-http canonical links", () => {
    const items = parseFeedItems(`
      <rss version="2.0">
        <channel>
          <item>
            <title>Relative link</title>
            <link>/posts/relative-link</link>
            <description>Ignored because the link is relative.</description>
          </item>
          <item>
            <title>Javascript link</title>
            <link>javascript:alert('xss')</link>
            <description>Ignored because the scheme is unsupported.</description>
          </item>
          <item>
            <title>Mailto guid</title>
            <guid isPermaLink="true">mailto:editor@example.com</guid>
            <description>Ignored because the permalink is not http.</description>
          </item>
          <item>
            <title>Usable link</title>
            <link>https://example.com/posts/usable-link</link>
            <description>Retained because the link is usable.</description>
          </item>
        </channel>
      </rss>
    `);

    expect(items).toEqual([
      expect.objectContaining({
        title: "Usable link",
        canonicalUrl: "https://example.com/posts/usable-link",
      }),
    ]);
  });

  it("blocks hostnames that resolve to loopback or private addresses", async () => {
    await expect(
      getResolvedSourceUrlError(
        "https://demo.127.0.0.1.nip.io/feed.xml",
        async () => [{ address: "127.0.0.1", family: 4 }],
      ),
    ).resolves.toBe("Source URL targets a blocked local or private address.");

    await expect(
      getResolvedSourceUrlError(
        "https://example.com/feed.xml",
        async () => [{ address: "93.184.216.34", family: 4 }],
      ),
    ).resolves.toBeNull();
  });

  it("blocks redirect targets that resolve to private addresses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://redirected.example.com/feed.xml",
          },
        }),
      );

    const lookupFn = vi.fn(async (hostname: string) => {
      if (hostname === "example.com") {
        return [{ address: "93.184.216.34", family: 4 }];
      }

      if (hostname === "redirected.example.com") {
        return [{ address: "127.0.0.1", family: 4 }];
      }

      throw new Error(`Unexpected hostname: ${hostname}`);
    });

    await expect(
      fetchSourceFeed("https://example.com/feed.xml", {
        fetchImpl,
        lookupFn,
      }),
    ).rejects.toThrow("Source URL targets a blocked local or private address.");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(lookupFn).toHaveBeenCalledTimes(2);
  });

  it("stores feed items per source and ignores duplicate canonical urls", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-rss-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const topicId = await createTopicRecord(store, {
        ownerId: "user-1",
        title: "Monitor feed",
        topicType: "TOPIC",
        userPrompt: "Track RSS updates",
      });
      const sourceId = await createSourceRecord(store, {
        topicId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });

      expect(
        await createItemRecord(store, {
          sourceId,
          title: "Older update",
          canonicalUrl: "https://example.com/posts/older-update",
          summary: "Older summary",
          publishedAt: "2026-05-19T16:00:00.000Z",
        }),
      ).toBe(true);
      expect(
        await createItemRecord(store, {
          sourceId,
          title: "Launch roundup",
          canonicalUrl: "https://example.com/posts/launch-roundup",
          summary: "Launch summary",
          publishedAt: "2026-05-20T08:30:00.000Z",
        }),
      ).toBe(true);
      expect(
        await createItemRecord(store, {
          sourceId,
          title: "Duplicate launch roundup",
          canonicalUrl: "https://example.com/posts/launch-roundup",
          summary: "Duplicate summary",
          publishedAt: "2026-05-20T08:30:00.000Z",
        }),
      ).toBe(false);

      expect(await listItemsBySource(store, sourceId)).toEqual([
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

  it("marks source sync results with status and error details", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-rss-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const topicId = await createTopicRecord(store, {
        ownerId: "user-1",
        title: "Monitor feed",
        topicType: "TOPIC",
        userPrompt: "Track RSS updates",
      });
      const sourceId = await createSourceRecord(store, {
        topicId,
        sourceType: "RSS",
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });

      await markSourceSyncResult(store, {
        sourceId,
        status: "error",
        error: "Feed request failed with 500",
      });

      expect(await listSourcesByTopic(store, topicId)).toEqual([
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
