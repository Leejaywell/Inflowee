/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";

import { generateTaskReport } from "@/lib/reports";
import {
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createTaskRecord,
  getReportById,
  listReportsByTask,
  saveTaskProfile,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("trend reports", () => {
  it("generates a current report from stored items and briefs", async () => {
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
      const item = await createItemRecordResult(fixture.store, {
        sourceId,
        title: "Devin coding agent launches workflow update",
        canonicalUrl: "https://example.com/devin",
        summary: "Coding agent update for developer teams.",
        qualityStatus: "accepted",
        relevanceScore: 0.82,
        relevanceReason: "Matched Devin and coding agent.",
        matchedTerms: ["devin", "coding", "agent"],
      });
      expect(item).not.toBeNull();
      const briefId = await createBriefRecord(fixture.store, {
        taskId,
        itemIds: item ? [item.id] : [],
        title: "Devin workflow update",
        summary: "Devin shipped a workflow update.",
        whyItMatters: "This suggests coding agents are moving into team workflows.",
        sourceCitations: ["https://example.com/devin"],
        relevanceScore: 0.82,
        importanceScore: 0.76,
        tags: ["coding-agent", "workflow"],
      });

      const reportId = await generateTaskReport(fixture.store, taskId, {
        mode: "current",
        now: new Date("2030-05-24T12:00:00.000Z"),
      });
      const report = await getReportById(fixture.store, reportId);

      expect(report).toMatchObject({
        taskId,
        mode: "current",
        briefIds: [briefId],
        sourceCitations: ["https://example.com/devin"],
        periodEnd: "2030-05-24T12:00:00.000Z",
      });
      expect(report?.markdown).toContain("Core Trends");
      expect(report?.markdown).toContain("coding-agent");
      expect(await listReportsByTask(fixture.store, taskId)).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });
});
