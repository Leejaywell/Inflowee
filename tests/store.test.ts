/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  countUnreadBriefs,
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createStore,
  createTopicRecord,
  getBriefById,
  getSourceById,
  getTopicById,
  getOrCreateChatThread,
  hasBriefOwner,
  hasTopicOwner,
  listBriefsFiltered,
  listItemsBySource,
  listSourcesByTopic,
  listTopics,
  markBriefRead,
} from "@/lib/store";

function withSqliteStore() {
  const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-store-test-"));
  const store = createStore(join(tempDirectory, "store.sqlite"));

  return {
    store,
    cleanup() {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}

describe("personal store model", () => {
  it("creates owner-scoped monitoring topicsLabel", async () => {
    const fixture = withSqliteStore();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        topicType: "TOPIC",
        userPrompt: "Track coding agents and product updates.",
      });

      await createTopicRecord(fixture.store, {
        ownerId: "user-2",
        title: "Other topic",
        topicType: "TOPIC",
        userPrompt: "Track unrelated updates.",
      });

      const topics = await listTopics(fixture.store, { actorId: "user-1" });

      expect(topics).toHaveLength(1);
      expect(topics[0]?.id).toBe(topicId);
      expect(topics[0]?.ownerId).toBe("user-1");
      expect(await hasTopicOwner(fixture.store, "user-1", topicId)).toBe(true);
      expect(await hasTopicOwner(fixture.store, "user-2", topicId)).toBe(false);
      expect(await getTopicById(fixture.store, topicId)).toEqual(
        expect.objectContaining({ title: "Track agents" }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("stores sources, quality-gated items, and personal briefs", async () => {
    const fixture = withSqliteStore();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        topicType: "TOPIC",
        userPrompt: "Track coding agents and product updates.",
      });
      const sourceId = await createSourceRecord(fixture.store, {
        topicId,
        sourceType: "RSS",
        title: "Agent feed",
        url: "https://example.com/feed.xml",
      });
      const item = await createItemRecordResult(fixture.store, {
        sourceId,
        title: "Devin launches agent update",
        canonicalUrl: "https://example.com/devin",
        summary: "A coding agent update with strong relevance.",
        isReal: true,
        relevanceScore: 0.82,
        relevanceReason: "Matched coding agent keywords.",
        keywordMentioned: true,
        matchedTerms: ["coding", "agent"],
        qualityStatus: "accepted",
      });

      expect(item?.qualityStatus).toBe("accepted");
      expect(item?.matchedTerms).toEqual(["coding", "agent"]);

      const briefId = await createBriefRecord(fixture.store, {
        topicId,
        itemIds: item ? [item.id] : [],
        title: "Agent update",
        summary: "Devin launched a relevant update.",
        whyItMatters: "This affects coding agent monitoring.",
        sourceCitations: ["https://example.com/devin"],
      });

      expect(await getSourceById(fixture.store, sourceId)).toEqual(
        expect.objectContaining({ topicId }),
      );
      expect(await listSourcesByTopic(fixture.store, topicId)).toHaveLength(1);
      expect(await listItemsBySource(fixture.store, sourceId)).toHaveLength(1);
      expect(await hasBriefOwner(fixture.store, "user-1", briefId)).toBe(true);
      expect(await hasBriefOwner(fixture.store, "user-2", briefId)).toBe(false);
      expect(await countUnreadBriefs(fixture.store, { actorId: "user-1" })).toBe(1);

      await markBriefRead(fixture.store, briefId, "user-1");

      expect(await getBriefById(fixture.store, briefId, { actorId: "user-1" })).toEqual(
        expect.objectContaining({ isRead: true, topicTitle: "Track agents" }),
      );
      expect(await listBriefsFiltered(fixture.store, { actorId: "user-1", topicId })).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("supports global, topic, and brief chat scopes only", async () => {
    const fixture = withSqliteStore();

    try {
      const thread = await getOrCreateChatThread(fixture.store, "topic", "topic-1");

      expect(thread.scopeType).toBe("topic");
      await expect(
        getOrCreateChatThread(
          fixture.store,
          "space" as unknown as Parameters<typeof getOrCreateChatThread>[1],
          "space-1",
        ),
      ).rejects.toThrow();
    } finally {
      fixture.cleanup();
    }
  });
});
