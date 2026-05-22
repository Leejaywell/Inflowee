/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getGroundingForScope } from "@/lib/grounding";
import {
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
} from "@/lib/store";
import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";

async function createFixture() {
  const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-grounding-test-"));
  const store = createStore(join(tempDirectory, "store.sqlite"));

  const spaceId = await createSpaceRecord(store, {
    name: "AI Watch",
  });
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
  const item = await createItemRecordResult(store, {
    sourceId,
    title: "Launch roundup",
    canonicalUrl: "https://example.com/launch",
    summary: "Latest launches.",
    publishedAt: "2026-05-21T08:00:00.000Z",
  });

  if (!item) {
    throw new Error("Expected fixture item to be inserted.");
  }

  const briefId = await createBriefRecord(store, {
    taskId,
    itemIds: [item.id],
    title: "Launch roundup",
    summary: "Latest launches.",
    whyItMatters: "New signal.",
    sourceCitations: ["https://example.com/launch"],
    relevanceScore: 0.5,
    importanceScore: 0.5,
    tags: [],
  });

  return {
    store,
    spaceId,
    taskId,
    briefId,
    itemId: item.id,
    cleanup() {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}

describe("getGroundingForScope", () => {
  it("returns task-scoped briefs and items", async () => {
    const fixture = await createFixture();

    try {
      const grounding = await getGroundingForScope(
        fixture.store,
        "task",
        fixture.taskId,
      );

      expect(grounding.briefs).toEqual([
        expect.objectContaining({
          id: fixture.briefId,
          taskId: fixture.taskId,
          title: "Launch roundup",
        }),
      ]);
      expect(grounding.items).toEqual([
        expect.objectContaining({
          id: fixture.itemId,
          title: "Launch roundup",
          canonicalUrl: "https://example.com/launch",
        }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("returns brief-scoped linked items", async () => {
    const fixture = await createFixture();

    try {
      const grounding = await getGroundingForScope(
        fixture.store,
        "brief",
        fixture.briefId,
      );

      expect(grounding.briefs).toHaveLength(1);
      expect(grounding.briefs[0]?.id).toBe(fixture.briefId);
      expect(grounding.items).toEqual([
        expect.objectContaining({
          id: fixture.itemId,
          canonicalUrl: "https://example.com/launch",
          rawContent: "Latest launches.",
          origin: "example.com",
          contentHash: expect.any(String),
        }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "returns task-scoped briefs and items from the postgres-backed store",
    async () => {
    const fixture = await createIsolatedPostgresStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Watch",
      });
      const taskId = await createTaskRecord(fixture.store, {
        spaceId,
        title: "Agent launches",
        taskType: "TOPIC",
        userPrompt: "Track launches",
      });
      const sourceId = await createSourceRecord(fixture.store, {
        taskId,
        sourceType: "RSS",
        title: "Feed",
        url: "https://example.com/feed.xml",
      });
      const item = await createItemRecordResult(fixture.store, {
        sourceId,
        title: "Launch roundup",
        canonicalUrl: "https://example.com/launch",
        summary: "Latest launches.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      });

      if (!item) {
        throw new Error("Expected fixture item to be inserted.");
      }

      const briefId = await createBriefRecord(fixture.store, {
        taskId,
        itemIds: [item.id],
        title: "Launch roundup",
        summary: "Latest launches.",
        whyItMatters: "New signal.",
        sourceCitations: ["https://example.com/launch"],
        relevanceScore: 0.5,
        importanceScore: 0.5,
        tags: [],
      });

      const grounding = await getGroundingForScope(
        fixture.store,
        "task",
        taskId,
      );

      expect(grounding.briefs).toEqual([
        expect.objectContaining({
          id: briefId,
          taskId,
        }),
      ]);
      expect(grounding.items).toEqual([
        expect.objectContaining({
          id: item.id,
          canonicalUrl: "https://example.com/launch",
        }),
      ]);
    } finally {
      await fixture.cleanup();
    }
  }, 15_000);

  it("returns space-scoped briefs and items across child tasks", async () => {
    const fixture = await createFixture();

    try {
      const grounding = await getGroundingForScope(
        fixture.store,
        "space",
        fixture.spaceId,
      );

      expect(grounding.briefs.map((brief) => brief.id)).toEqual([fixture.briefId]);
      expect(grounding.items.map((item) => item.id)).toEqual([fixture.itemId]);
    } finally {
      fixture.cleanup();
    }
    },
  );

  it("can retrieve briefs across sibling tasks within a space when task scope is empty", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-grounding-test-"));
    const store = createStore(join(tempDirectory, "store.sqlite"));

    try {
      const spaceId = await createSpaceRecord(store, {
        name: "AI Watch",
      });
      const emptyTaskId = await createTaskRecord(store, {
        spaceId,
        title: "Empty task",
        taskType: "TOPIC",
        userPrompt: "Track empty scope",
      });
      const siblingTaskId = await createTaskRecord(store, {
        spaceId,
        title: "Filled task",
        taskType: "TOPIC",
        userPrompt: "Track launches",
      });
      const sourceId = await createSourceRecord(store, {
        taskId: siblingTaskId,
        sourceType: "RSS",
        title: "Feed",
        url: "https://example.com/feed.xml",
      });
      const item = await createItemRecordResult(store, {
        sourceId,
        title: "Launch roundup",
        canonicalUrl: "https://example.com/launch",
        summary: "Latest launches.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      });

      if (!item) {
        throw new Error("Expected fixture item to be inserted.");
      }

      const briefId = await createBriefRecord(store, {
        taskId: siblingTaskId,
        itemIds: [item.id],
        title: "Launch roundup",
        summary: "Latest launches.",
        whyItMatters: "New signal.",
        sourceCitations: ["https://example.com/launch"],
      });

      const grounding = await getGroundingForScope(store, "task", emptyTaskId, {
        fallbackSpaceId: spaceId,
        includeSiblingFallback: true,
      });

      expect(grounding.briefs.map((brief) => brief.id)).toEqual([briefId]);
      expect(grounding.items.map((result) => result.id)).toEqual([item.id]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("deduplicates task-scoped items by canonical url and keeps the freshest item", async () => {
    const fixture = await createFixture();

    try {
      const secondSourceId = await createSourceRecord(fixture.store, {
        taskId: fixture.taskId,
        sourceType: "RSS",
        title: "Backup feed",
        url: "https://example.com/backup.xml",
      });

      const newerDuplicate = await createItemRecordResult(fixture.store, {
        sourceId: secondSourceId,
        title: "Launch roundup duplicate",
        canonicalUrl: "https://example.com/launch",
        summary: "Same article from another feed.",
        publishedAt: "2026-05-22T08:00:00.000Z",
      });

      expect(newerDuplicate).not.toBeNull();

      const grounding = await getGroundingForScope(
        fixture.store,
        "task",
        fixture.taskId,
      );

      expect(grounding.items).toHaveLength(1);
      expect(grounding.items[0]?.id).toBe(newerDuplicate?.id);
    } finally {
      fixture.cleanup();
    }
  });

  it("globally sorts task-scoped items across sources by publishedAt then createdAt", async () => {
    const fixture = await createFixture();

    try {
      const secondSourceId = await createSourceRecord(fixture.store, {
        taskId: fixture.taskId,
        sourceType: "RSS",
        title: "Second feed",
        url: "https://example.com/second.xml",
      });

      const oldest = await createItemRecordResult(fixture.store, {
        sourceId: secondSourceId,
        title: "Oldest",
        canonicalUrl: "https://example.com/oldest",
        publishedAt: "2026-05-20T08:00:00.000Z",
      });
      const newest = await createItemRecordResult(fixture.store, {
        sourceId: secondSourceId,
        title: "Newest",
        canonicalUrl: "https://example.com/newest",
        publishedAt: "2026-05-23T08:00:00.000Z",
      });

      expect(oldest).not.toBeNull();
      expect(newest).not.toBeNull();

      const grounding = await getGroundingForScope(
        fixture.store,
        "task",
        fixture.taskId,
      );

      expect(grounding.items.map((item) => item.canonicalUrl)).toEqual([
        "https://example.com/newest",
        "https://example.com/launch",
        "https://example.com/oldest",
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("globally sorts and deduplicates space-scoped items across child tasks", async () => {
    const fixture = await createFixture();

    try {
      const secondTaskId = await createTaskRecord(fixture.store, {
        spaceId: fixture.spaceId,
        title: "Funding",
        taskType: "TOPIC",
        userPrompt: "Track funding",
      });
      const secondSourceId = await createSourceRecord(fixture.store, {
        taskId: secondTaskId,
        sourceType: "RSS",
        title: "Funding feed",
        url: "https://example.com/funding.xml",
      });

      const uniqueItem = await createItemRecordResult(fixture.store, {
        sourceId: secondSourceId,
        title: "Funding round",
        canonicalUrl: "https://example.com/funding",
        publishedAt: "2026-05-24T08:00:00.000Z",
      });
      const duplicateItem = await createItemRecordResult(fixture.store, {
        sourceId: secondSourceId,
        title: "Launch roundup mirrored",
        canonicalUrl: "https://example.com/launch",
        publishedAt: "2026-05-22T08:00:00.000Z",
      });

      expect(uniqueItem).not.toBeNull();
      expect(duplicateItem).not.toBeNull();

      const grounding = await getGroundingForScope(
        fixture.store,
        "space",
        fixture.spaceId,
      );

      expect(grounding.items.map((item) => item.canonicalUrl)).toEqual([
        "https://example.com/funding",
        "https://example.com/launch",
      ]);
      expect(grounding.items[1]?.id).toBe(duplicateItem?.id);
    } finally {
      fixture.cleanup();
    }
  });

  it("skips item reads when includeItems is false", async () => {
    const fixture = await createFixture();

    try {
      const grounding = await getGroundingForScope(
        fixture.store,
        "space",
        fixture.spaceId,
        { includeItems: false },
      );

      expect(grounding.briefs).toHaveLength(1);
      expect(grounding.items).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });

  it("prefers valid publishedAt over invalid strings for sorting and dedupe freshness", async () => {
    const fixture = await createFixture();

    try {
      const secondSourceId = await createSourceRecord(fixture.store, {
        taskId: fixture.taskId,
        sourceType: "RSS",
        title: "Second feed",
        url: "https://example.com/second.xml",
      });

      const invalidPublishedAtItem = await createItemRecordResult(fixture.store, {
        sourceId: secondSourceId,
        title: "Invalid published time",
        canonicalUrl: "https://example.com/invalid-published",
        publishedAt: "not-a-date",
      });
      const validPublishedAtItem = await createItemRecordResult(fixture.store, {
        sourceId: secondSourceId,
        title: "Valid published time",
        canonicalUrl: "https://example.com/valid-published",
        publishedAt: "2026-05-25T08:00:00.000Z",
      });
      const invalidDuplicate = await createItemRecordResult(fixture.store, {
        sourceId: secondSourceId,
        title: "Launch roundup invalid duplicate",
        canonicalUrl: "https://example.com/launch",
        publishedAt: "definitely-invalid",
      });

      expect(invalidPublishedAtItem).not.toBeNull();
      expect(validPublishedAtItem).not.toBeNull();
      expect(invalidDuplicate).not.toBeNull();

      const grounding = await getGroundingForScope(
        fixture.store,
        "task",
        fixture.taskId,
      );

      expect(grounding.items.slice(0, 2).map((item) => item.canonicalUrl)).toEqual([
        "https://example.com/valid-published",
        "https://example.com/launch",
      ]);
      expect(
        grounding.items.find((item) => item.canonicalUrl === "https://example.com/launch")?.id,
      ).toBe(fixture.itemId);
      expect(
        grounding.items.find(
          (item) => item.canonicalUrl === "https://example.com/invalid-published",
        )?.id,
      ).toBe(invalidPublishedAtItem?.id);
    } finally {
      fixture.cleanup();
    }
  });
});
