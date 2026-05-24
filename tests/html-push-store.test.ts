/// <reference types="vitest/globals" />

import {
  createDeliveryLog,
  createHtmlPublication,
  createTopicRecord,
  finishDeliveryLog,
  getHtmlPublicationByContent,
  getHtmlPushConfig,
  getTopicHtmlPushConfig,
  listRecentDeliveryLogsByContent,
  listRecentHtmlPublications,
  saveHtmlPushConfig,
  saveTopicHtmlPushConfig,
  updateHtmlPublication,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

describe("HTML push SQLite store", () => {
  it("saves global and topic HTML push configuration", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        topicType: "TOPIC",
        userPrompt: "Monitor AI coding tools and product updates.",
      });

      await saveHtmlPushConfig(fixture.store, {
        ownerId: "user-1",
        enabled: true,
        stylePreset: "minimal_news",
        modulePreset: "standard_summary",
        enabledModules: ["summary", "key_content", "citations"],
        githubTokenEncrypted: "encrypted-token",
        githubRepo: "owner/repo",
        githubBranch: "main",
        githubBasePath: "inflowee/html",
        publicBaseUrl: "https://example.com",
      });
      await saveTopicHtmlPushConfig(fixture.store, {
        topicId,
        useGlobal: false,
        enabled: true,
        stylePreset: "tech_radar",
        modulePreset: "analysis_report",
        enabledModules: ["summary", "ai_conclusion"],
        customPrompt: "Focus on trend deltas.",
      });

      expect(await getHtmlPushConfig(fixture.store, "user-1")).toEqual(
        expect.objectContaining({
          enabled: true,
          githubRepo: "owner/repo",
          enabledModules: ["summary", "key_content", "citations"],
        }),
      );
      expect(await getTopicHtmlPushConfig(fixture.store, topicId)).toEqual(
        expect.objectContaining({
          useGlobal: false,
          stylePreset: "tech_radar",
          enabledModules: ["summary", "ai_conclusion"],
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("creates, updates, and lists HTML publications", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "AI tools",
        topicType: "TOPIC",
        userPrompt: "Monitor AI coding tools and product updates.",
      });
      const publicationId = await createHtmlPublication(fixture.store, {
        ownerId: "user-1",
        topicId,
        contentType: "brief",
        contentId: "brief-1",
        status: "pending",
        styleConfig: { stylePreset: "minimal_news" },
        moduleConfig: { enabledModules: ["summary"] },
      });

      await updateHtmlPublication(fixture.store, publicationId, {
        status: "published",
        title: "AI tools brief",
        html: "<!doctype html><html></html>",
        htmlUrl: "https://example.com/brief-1.html",
        publishPath: "inflowee/html/topics/ai-tools/brief-1.html",
        commitSha: "sha-1",
        publishedAt: "2026-05-25T00:00:00.000Z",
      });

      expect(
        await getHtmlPublicationByContent(fixture.store, {
          contentType: "brief",
          contentId: "brief-1",
        }),
      ).toEqual(
        expect.objectContaining({
          id: publicationId,
          status: "published",
          htmlUrl: "https://example.com/brief-1.html",
          publishPath: "inflowee/html/topics/ai-tools/brief-1.html",
        }),
      );
      expect(
        await listRecentHtmlPublications(fixture.store, 10, {
          ownerId: "user-1",
        }),
      ).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("stores HTML publication status on delivery logs", async () => {
    const fixture = createSqliteFixture();

    try {
      const logId = await createDeliveryLog(fixture.store, {
        contentType: "brief",
        contentId: "brief-1",
        endpoint: "https://example.com/webhook",
        payloadType: "slack",
        htmlStatus: "pending",
      });

      await finishDeliveryLog(fixture.store, {
        logId,
        status: "success",
        attemptCount: 1,
        responseStatus: 200,
        htmlPublicationId: "publication-1",
        htmlUrl: "https://example.com/brief-1.html",
        htmlStatus: "published",
      });

      expect(
        await listRecentDeliveryLogsByContent(
          fixture.store,
          "brief",
          "brief-1",
        ),
      ).toEqual([
        expect.objectContaining({
          htmlPublicationId: "publication-1",
          htmlUrl: "https://example.com/brief-1.html",
          htmlStatus: "published",
        }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });
});
