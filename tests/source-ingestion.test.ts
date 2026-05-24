/// <reference types="vitest/globals" />

import {
  previewSubscriptionSources,
  storeSourceItemsAndCreateBriefs,
  syncSourceById,
} from "@/lib/source-ingestion";
import {
  createSourceRecord,
  createTaskRecord,
  listBriefsFiltered,
  listItemsBySource,
  listSources,
  saveTaskProfile,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

function sampleFeedXml() {
  return `
    <rss version="2.0">
      <channel>
        <item>
          <title>Devin coding agent launches product update</title>
          <link>https://example.com/devin-update</link>
          <description>Important coding agent update for developer tools.</description>
          <pubDate>Fri, 22 May 2026 10:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Unrelated cooking tips</title>
          <link>https://example.com/cooking</link>
          <description>Recipe content that should be filtered.</description>
        </item>
      </channel>
    </rss>
  `;
}

function sampleHotlistHtml() {
  return `
    <html>
      <body>
        <ul class="hot-list">
          <li><a href="/hot/ai-coding">Devin coding agent hot launch</a><span>热度 88万</span></li>
          <li><a href="/hot/celebrity">Celebrity gossip</a><span>热度 60万</span></li>
        </ul>
      </body>
    </html>
  `;
}

describe("source ingestion quality and preview flow", () => {
  it("previews selected sources without persisting source records", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Monitor Devin coding agent product updates.",
      });
      await saveTaskProfile(fixture.store, taskId, {
        keywords: ["Devin", "coding agent"],
        suggestedQueries: ["Devin coding agent update"],
      });

      const preview = await previewSubscriptionSources(
        fixture.store,
        taskId,
        [
          {
            title: "Agent feed",
            sourceType: "RSS",
            url: "https://example.com/feed.xml",
          },
        ],
        {
          fetchSourceFeedImpl: vi.fn().mockResolvedValue(sampleFeedXml()),
        },
      );

      expect(preview.sourceCount).toBe(1);
      expect(preview.candidateItemCount).toBe(2);
      expect(preview.acceptedItemCount).toBe(1);
      expect(preview.rejectedItemCount).toBe(1);
      expect(await listSources(fixture.store)).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("stores only accepted items for brief generation", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Monitor Devin coding agent product updates.",
      });
      await saveTaskProfile(fixture.store, taskId, {
        keywords: ["Devin", "coding agent"],
        suggestedQueries: ["Devin coding agent update"],
      });
      const sourceId = await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Agent feed",
        url: "https://example.com/feed.xml",
      });

      const result = await storeSourceItemsAndCreateBriefs(
        fixture.store,
        { id: sourceId, taskId },
        [
          {
            title: "Devin coding agent launches product update",
            canonicalUrl: "https://example.com/devin-update",
            summary: "Important coding agent update for developer tools.",
            publishedAt: "2026-05-22T10:00:00.000Z",
          },
          {
            title: "Unrelated cooking tips",
            canonicalUrl: "https://example.com/cooking",
            summary: "Recipe content that should be filtered.",
            publishedAt: "2026-05-22T10:00:00.000Z",
          },
        ],
      );

      const items = await listItemsBySource(fixture.store, sourceId);
      const briefs = await listBriefsFiltered(fixture.store, {
        actorId: "user-1",
        taskId,
      });

      expect(result.insertedItemCount).toBe(2);
      expect(items.map((item) => item.qualityStatus).sort()).toEqual([
        "accepted",
        "rejected",
      ]);
      expect(briefs).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("syncs discovery sources through the same item and brief pipeline", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Monitor Devin coding agent product updates.",
      });
      await saveTaskProfile(fixture.store, taskId, {
        keywords: ["Devin", "coding agent"],
        suggestedQueries: ["Devin coding agent update"],
      });
      const sourceId = await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "SEARCH_DISCOVERY",
        title: "Search discovery",
        url: "radar://search-discovery",
        configJson: {
          providers: ["bing"],
          queries: ["Devin coding agent update"],
          freshnessDays: 7,
          providerQuota: 3,
          totalQuota: 3,
        },
      });

      const result = await syncSourceById(fixture.store, sourceId, {
        fetchSourceFeedImpl: vi.fn().mockResolvedValue(sampleFeedXml()),
      });

      expect(result.ok).toBe(true);
      expect(await listItemsBySource(fixture.store, sourceId)).toHaveLength(2);
      expect(
        await listBriefsFiltered(fixture.store, { actorId: "user-1", taskId }),
      ).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("syncs hotlist discovery sources through the same item and brief pipeline", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "Coding agents",
        taskType: "TOPIC",
        userPrompt: "Monitor Devin coding agent product updates.",
      });
      await saveTaskProfile(fixture.store, taskId, {
        keywords: ["Devin", "coding agent"],
        suggestedQueries: ["Devin coding agent update"],
      });
      const sourceId = await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "HOTLIST_DISCOVERY",
        title: "Hotlist discovery",
        url: "radar://hotlist-discovery",
        configJson: {
          providers: ["baidu"],
          providerQuota: 3,
          totalQuota: 3,
        },
      });

      const result = await syncSourceById(fixture.store, sourceId, {
        fetchSourceFeedImpl: vi.fn().mockResolvedValue(sampleHotlistHtml()),
      });

      expect(result.ok).toBe(true);
      const items = await listItemsBySource(fixture.store, sourceId);
      expect(items).toHaveLength(2);
      expect(items.filter((item) => item.qualityStatus === "accepted")).toHaveLength(1);
      const acceptedHotlistItem = items.find(
        (item) => item.qualityStatus === "accepted",
      );
      expect(acceptedHotlistItem?.structuredFields).toMatchObject({
        sourceProvider: "baidu",
        platform: "Baidu Hot Search",
        rank: 1,
      });
      expect(
        await listBriefsFiltered(fixture.store, { actorId: "user-1", taskId }),
      ).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });
});
