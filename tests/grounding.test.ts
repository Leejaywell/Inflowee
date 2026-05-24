/// <reference types="vitest/globals" />

import { getGroundingForScope } from "@/lib/grounding";
import {
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createTopicRecord,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

async function createPersonalGroundingFixture() {
  const fixture = createSqliteFixture();
  const topicId = await createTopicRecord(fixture.store, {
    ownerId: "user-1",
    title: "Track coding agents",
    topicType: "TOPIC",
    userPrompt: "Track coding agent launches and funding.",
  });
  const sourceId = await createSourceRecord(fixture.store, {
    topicId,
    sourceType: "RSS",
    title: "Agent feed",
    url: "https://example.com/feed.xml",
  });
  const item = await createItemRecordResult(fixture.store, {
    sourceId,
    title: "Devin launches new coding agent update",
    canonicalUrl: "https://example.com/devin",
    summary: "A coding agent update.",
    qualityStatus: "accepted",
    isReal: true,
    relevanceScore: 0.8,
    relevanceReason: "Matched coding agent.",
    keywordMentioned: true,
    matchedTerms: ["coding", "agent"],
  });
  const briefId = await createBriefRecord(fixture.store, {
    topicId,
    itemIds: item ? [item.id] : [],
    title: "Agent launch",
    summary: "A relevant coding agent update was found.",
    whyItMatters: "It matches the personal topic.",
    sourceCitations: ["https://example.com/devin"],
  });

  return { ...fixture, topicId, briefId };
}

describe("personal grounding scopes", () => {
  it("returns topic briefs and source items for a personal topic", async () => {
    const fixture = await createPersonalGroundingFixture();

    try {
      const grounding = await getGroundingForScope(
        fixture.store,
        "topic",
        fixture.topicId,
        { actorId: "user-1" },
      );

      expect(grounding.briefs).toHaveLength(1);
      expect(grounding.items).toHaveLength(1);
      expect(grounding.briefs[0]?.topicTitle).toBe("Track coding agents");
    } finally {
      fixture.cleanup();
    }
  });

  it("returns only the selected brief and linked items for brief scope", async () => {
    const fixture = await createPersonalGroundingFixture();

    try {
      const grounding = await getGroundingForScope(
        fixture.store,
        "brief",
        fixture.briefId,
      );

      expect(grounding.briefs.map((brief) => brief.id)).toEqual([fixture.briefId]);
      expect(grounding.items[0]?.canonicalUrl).toBe("https://example.com/devin");
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps global grounding scoped to the requesting owner", async () => {
    const fixture = await createPersonalGroundingFixture();

    try {
      await createTopicRecord(fixture.store, {
        ownerId: "user-2",
        title: "Other monitor",
        topicType: "TOPIC",
        userPrompt: "Track unrelated updates.",
      });

      const grounding = await getGroundingForScope(
        fixture.store,
        "global",
        "global",
        { actorId: "user-1" },
      );

      expect(grounding.briefs).toHaveLength(1);
      expect(grounding.briefs[0]?.topicId).toBe(fixture.topicId);
    } finally {
      fixture.cleanup();
    }
  });
});
