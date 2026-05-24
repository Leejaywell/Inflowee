/// <reference types="vitest/globals" />

import {
  countUnreadBriefs,
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createTopicRecord,
  deleteBrief,
  getBriefById,
  listBriefItemIds,
  listBriefsFiltered,
  markBriefRead,
  markBriefUnread,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("personal briefs", () => {
  it("lists and filters briefs by personal topic owner", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        topicType: "TOPIC",
        userPrompt: "Track coding agents.",
      });
      const otherTopicId = await createTopicRecord(fixture.store, {
        ownerId: "user-2",
        title: "Other",
        topicType: "TOPIC",
        userPrompt: "Track other updates.",
      });
      const sourceId = await createSourceRecord(fixture.store, {
        topicId,
        sourceType: "RSS",
        title: "Agent feed",
        url: "https://example.com/feed.xml",
      });
      const item = await createItemRecordResult(fixture.store, {
        sourceId,
        title: "Agent launch",
        canonicalUrl: "https://example.com/agent",
        qualityStatus: "accepted",
      });
      const briefId = await createBriefRecord(fixture.store, {
        topicId,
        itemIds: item ? [item.id] : [],
        title: "Agent launch",
        summary: "A new agent launched.",
        whyItMatters: "It matches the topic.",
        sourceCitations: ["https://example.com/agent"],
      });
      await createBriefRecord(fixture.store, {
        topicId: otherTopicId,
        itemIds: [],
        title: "Other launch",
        summary: "Other content.",
        whyItMatters: "Other.",
        sourceCitations: ["https://example.com/other"],
      });

      expect(await listBriefsFiltered(fixture.store, { actorId: "user-1" })).toEqual([
        expect.objectContaining({ id: briefId, topicTitle: "Track agents" }),
      ]);
      expect(await listBriefItemIds(fixture.store, briefId)).toEqual([item?.id]);
      expect(await countUnreadBriefs(fixture.store, { actorId: "user-1" })).toBe(1);

      await markBriefRead(fixture.store, briefId, "user-1");
      expect(await getBriefById(fixture.store, briefId, { actorId: "user-1" })).toEqual(
        expect.objectContaining({ isRead: true }),
      );

      await markBriefUnread(fixture.store, briefId, "user-1");
      expect(await countUnreadBriefs(fixture.store, { actorId: "user-1" })).toBe(1);

      await deleteBrief(fixture.store, briefId);
      expect(await getBriefById(fixture.store, briefId)).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });
});
