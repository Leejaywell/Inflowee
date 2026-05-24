/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";

import { SESSION_SECRET_ENV } from "@/lib/auth-config";
import {
  maybeCreateHtmlPublicationForDelivery,
  previewTopicHtmlPublication,
} from "@/lib/html-push";
import { encryptSecret } from "@/lib/secret-box";
import {
  createBriefRecord,
  createTopicRecord,
  getHtmlPublicationById,
  getHtmlPublicationByContent,
  saveHtmlPushConfig,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

const previousSessionSecret = process.env[SESSION_SECRET_ENV];
const previousOpenAiKey = process.env.OPENAI_API_KEY;
const previousAiKey = process.env.AI_API_KEY;

function restoreEnv() {
  if (previousSessionSecret === undefined) {
    delete process.env[SESSION_SECRET_ENV];
  } else {
    process.env[SESSION_SECRET_ENV] = previousSessionSecret;
  }
  if (previousOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = previousOpenAiKey;
  }
  if (previousAiKey === undefined) {
    delete process.env.AI_API_KEY;
  } else {
    process.env.AI_API_KEY = previousAiKey;
  }
}

async function createBriefFixture() {
  const fixture = createSqliteFixture();
  const topicId = await createTopicRecord(fixture.store, {
    ownerId: "user-1",
    title: "AI tools",
    topicType: "TOPIC",
    userPrompt: "Monitor AI coding tools and product updates.",
  });
  const briefId = await createBriefRecord(fixture.store, {
    topicId,
    itemIds: [],
    title: "AI update",
    summary: "A relevant update.",
    whyItMatters: "Developer tooling is changing.",
    sourceCitations: ["https://example.com/source"],
  });

  return { fixture, topicId, briefId };
}

function createGitHubFetch(status = 200) {
  return vi.fn<typeof fetch>().mockImplementation(
    async (_url: string | URL | Request, init?: RequestInit) => {
      if (!init?.method) {
        return new Response("", { status: 404 });
      }

      return new Response(
        status === 200
          ? JSON.stringify({
              content: { html_url: "https://github.com/owner/repo/blob/main/file.html" },
              commit: { sha: "commit-sha" },
            })
          : "publish failed",
        { status },
      );
    },
  );
}

describe("HTML push delivery orchestration", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("skips when global config is disabled", async () => {
    const { fixture, briefId } = await createBriefFixture();

    try {
      await saveHtmlPushConfig(fixture.store, {
        ownerId: "user-1",
        enabled: false,
        stylePreset: "minimal_news",
        modulePreset: "standard_summary",
        enabledModules: ["summary"],
      });

      await expect(
        maybeCreateHtmlPublicationForDelivery(fixture.store, {
          contentType: "brief",
          briefId,
        }),
      ).resolves.toEqual({
        status: "skipped",
        reason: "HTML push enhancement is disabled.",
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("publishes a brief HTML page and reuses the existing publication", async () => {
    process.env[SESSION_SECRET_ENV] = "test-secret";
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;
    const { fixture, briefId } = await createBriefFixture();
    const fetchImpl = createGitHubFetch();

    try {
      await saveHtmlPushConfig(fixture.store, {
        ownerId: "user-1",
        enabled: true,
        stylePreset: "minimal_news",
        modulePreset: "standard_summary",
        enabledModules: ["summary", "key_content", "citations"],
        githubTokenEncrypted: encryptSecret("github-token"),
        githubRepo: "owner/repo",
        githubBranch: "main",
        githubBasePath: "inflowee/html",
        publicBaseUrl: "https://pages.example.com",
      });

      const result = await maybeCreateHtmlPublicationForDelivery(
        fixture.store,
        { contentType: "brief", briefId },
        {
          fetchImpl,
          now: new Date("2026-05-25T00:00:00.000Z"),
          locale: "en",
        },
      );

      expect(result).toEqual(
        expect.objectContaining({
          status: "published",
          htmlUrl:
            "https://pages.example.com/inflowee/html/topics/ai-tools/brief-" +
            `${briefId}.html`,
        }),
      );
      expect(
        await getHtmlPublicationByContent(fixture.store, {
          contentType: "brief",
          contentId: briefId,
        }),
      ).toEqual(expect.objectContaining({ status: "published" }));

      const reused = await maybeCreateHtmlPublicationForDelivery(
        fixture.store,
        { contentType: "brief", briefId },
        { fetchImpl },
      );

      expect(reused).toEqual(result);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      fixture.cleanup();
    }
  });

  it("marks publication failed when GitHub publishing fails", async () => {
    process.env[SESSION_SECRET_ENV] = "test-secret";
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;
    const { fixture, briefId } = await createBriefFixture();

    try {
      await saveHtmlPushConfig(fixture.store, {
        ownerId: "user-1",
        enabled: true,
        stylePreset: "minimal_news",
        modulePreset: "standard_summary",
        enabledModules: ["summary"],
        githubTokenEncrypted: encryptSecret("github-token"),
        githubRepo: "owner/repo",
        githubBranch: "main",
        githubBasePath: "inflowee/html",
      });

      const result = await maybeCreateHtmlPublicationForDelivery(
        fixture.store,
        { contentType: "brief", briefId },
        { fetchImpl: createGitHubFetch(401) },
      );

      expect(result).toEqual(
        expect.objectContaining({
          status: "failed",
          error: expect.stringContaining("GitHub HTML publish failed: 401"),
        }),
      );
      expect(
        await getHtmlPublicationByContent(fixture.store, {
          contentType: "brief",
          contentId: briefId,
        }),
      ).toEqual(expect.objectContaining({ status: "failed" }));
    } finally {
      fixture.cleanup();
    }
  });

  it("generates a topic HTML preview without publishing to GitHub", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;
    const { fixture, topicId } = await createBriefFixture();

    try {
      const result = await previewTopicHtmlPublication(fixture.store, topicId, {
        now: new Date("2026-05-25T00:00:00.000Z"),
        locale: "en",
      });

      expect(result.status).toBe("generated");
      if (result.status !== "generated") {
        throw new Error("Expected generated preview.");
      }

      const publication = await getHtmlPublicationById(
        fixture.store,
        result.publicationId,
      );

      expect(publication).toEqual(
        expect.objectContaining({
          status: "generated",
          htmlUrl: null,
          publishPath: null,
        }),
      );
      expect(publication?.html).toContain("<!doctype html>");
      expect(publication?.contentId).toContain(":preview:");
    } finally {
      fixture.cleanup();
    }
  });

  it("reports preview unavailable when the topic has no brief or report", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "Empty topic",
        topicType: "TOPIC",
        userPrompt: "Monitor a topic with no content.",
      });

      await expect(
        previewTopicHtmlPublication(fixture.store, topicId),
      ).resolves.toEqual({
        status: "unavailable",
        reason: "No eligible Brief or Report is available for preview.",
      });
    } finally {
      fixture.cleanup();
    }
  });
});
