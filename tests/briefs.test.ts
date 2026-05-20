/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { storeSourceItemsAndCreateBriefs } from "@/app/actions";
import { buildBriefsFromItems } from "@/lib/briefs";
import {
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  getTaskBySourceId,
  listBriefs,
} from "@/lib/store";

describe("buildBriefsFromItems", () => {
  it("turns new feed items into brief records", () => {
    const briefs = buildBriefsFromItems("task-1", [
      {
        id: "item-1",
        title: "Launch roundup",
        canonicalUrl: "https://example.com/posts/launch-roundup",
        summary: "Latest launches and product updates.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      },
    ]);

    expect(briefs).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        itemIds: ["item-1"],
        title: "Launch roundup",
        summary: "Latest launches and product updates.",
        whyItMatters: "New signal captured from subscribed RSS sources.",
        sourceCitations: ["https://example.com/posts/launch-roundup"],
      }),
    ]);
  });

  it("stores generated briefs with task and space context", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-briefs-test-"));
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
      const item = createItemRecordResult(store, {
        sourceId,
        title: "Launch roundup",
        canonicalUrl: "https://example.com/posts/launch-roundup",
        summary: "Latest launches and product updates.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      });

      expect(item).not.toBeNull();
      expect(getTaskBySourceId(store, sourceId)?.id).toBe(taskId);

      const briefs = buildBriefsFromItems(taskId, [item!]);

      for (const brief of briefs) {
        createBriefRecord(store, brief);
      }

      expect(listBriefs(store)).toEqual([
        expect.objectContaining({
          taskId,
          title: "Launch roundup",
          summary: "Latest launches and product updates.",
          whyItMatters: "New signal captured from subscribed RSS sources.",
          sourceCitations: ["https://example.com/posts/launch-roundup"],
          taskTitle: "Monitor feed",
          spaceName: "OpenAI",
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("does not create duplicate briefs when the same source items sync twice", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-briefs-test-"));
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

      const syncPayload = [
        {
          title: "Launch roundup",
          canonicalUrl: "https://example.com/posts/launch-roundup",
          summary: "Latest launches and product updates.",
          publishedAt: "2026-05-21T08:00:00.000Z",
        },
      ];

      expect(
        storeSourceItemsAndCreateBriefs(
          store,
          { id: sourceId, taskId },
          syncPayload,
        ),
      ).toEqual({
        insertedItemCount: 1,
        createdBriefCount: 1,
      });
      expect(
        storeSourceItemsAndCreateBriefs(
          store,
          { id: sourceId, taskId },
          syncPayload,
        ),
      ).toEqual({
        insertedItemCount: 0,
        createdBriefCount: 0,
      });

      expect(listBriefs(store)).toHaveLength(1);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
