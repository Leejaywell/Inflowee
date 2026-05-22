/// <reference types="vitest/globals" />

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";

import InboxPage from "@/app/inbox/page";
import { buildBriefsFromItems } from "@/lib/briefs";
import {
  createItemRecordResult,
  createBriefRecord,
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  getTaskBySourceId,
  listBriefs,
} from "@/lib/store";

describe("buildBriefsFromItems", () => {
  it("renders the inbox heading", async () => {
    const view = await InboxPage({ searchParams: Promise.resolve({}) });

    render(view);

    expect(
      screen.getByRole("heading", { name: "Brief inbox" }),
    ).toBeInTheDocument();
  });

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
        relevanceScore: 0.5,
        importanceScore: 0.5,
        tags: [],
      }),
    ]);
  });

  it("stores generated briefs with task and space context", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-briefs-test-"));
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
        title: "OpenAI News",
        url: "https://example.com/feed.xml",
      });
      const item = await createItemRecordResult(store, {
        sourceId,
        title: "Launch roundup",
        canonicalUrl: "https://example.com/posts/launch-roundup",
        summary: "Latest launches and product updates.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      });

      expect(item).not.toBeNull();
      expect((await getTaskBySourceId(store, sourceId))?.id).toBe(taskId);

      const briefs = buildBriefsFromItems(taskId, [item!]);

      for (const brief of briefs) {
        await createBriefRecord(store, brief);
      }

      expect(await listBriefs(store)).toEqual([
        expect.objectContaining({
          taskId,
          title: "Launch roundup",
          summary: "Latest launches and product updates.",
          whyItMatters: "New signal captured from subscribed RSS sources.",
          sourceCitations: ["https://example.com/posts/launch-roundup"],
          relevanceScore: 0.5,
          importanceScore: 0.5,
          tags: [],
          taskTitle: "Monitor feed",
          spaceName: "OpenAI",
        }),
      ]);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("does not create duplicate briefs when the same source items sync twice", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-briefs-test-"));
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

      const firstInsertedItems = (
        await Promise.all(
          syncPayload.map((item) =>
            createItemRecordResult(store, {
              sourceId,
              title: item.title,
              canonicalUrl: item.canonicalUrl,
              summary: item.summary,
              publishedAt: item.publishedAt,
            }),
          ),
        )
      ).filter((item) => item !== null);

      for (const brief of buildBriefsFromItems(taskId, firstInsertedItems)) {
        await createBriefRecord(store, brief);
      }

      const secondInsertedItems = (
        await Promise.all(
          syncPayload.map((item) =>
            createItemRecordResult(store, {
              sourceId,
              title: item.title,
              canonicalUrl: item.canonicalUrl,
              summary: item.summary,
              publishedAt: item.publishedAt,
            }),
          ),
        )
      ).filter((item) => item !== null);

      for (const brief of buildBriefsFromItems(taskId, secondInsertedItems)) {
        await createBriefRecord(store, brief);
      }

      expect(await listBriefs(store)).toHaveLength(1);
    } finally {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
