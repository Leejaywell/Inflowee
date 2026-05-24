/// <reference types="vitest/globals" />

import {
  generateHtmlPushStructuredContent,
  parseHtmlPushStructuredContent,
} from "@/lib/html-push-generation";
import { makeTopicRecord } from "./helpers/records";

describe("HTML push generation", () => {
  it("parses valid structured JSON", () => {
    const parsed = parseHtmlPushStructuredContent(
      JSON.stringify({
        title: "AI update",
        subtitle: "Daily brief",
        summary: "A relevant update.",
        keyPoints: [{ title: "Launch", body: "New feature", url: "https://example.com" }],
        aiConclusion: "Worth watching.",
        trendChanges: ["More agents"],
        recommendedActions: ["Track adoption"],
        citations: [{ label: "Source", url: "https://example.com" }],
      }),
    );

    expect(parsed.title).toBe("AI update");
    expect(parsed.keyPoints).toHaveLength(1);
    expect(parsed.citations).toEqual([
      { label: "Source", url: "https://example.com" },
    ]);
  });

  it("rejects missing title or summary", () => {
    expect(() =>
      parseHtmlPushStructuredContent(JSON.stringify({ title: "Only title" })),
    ).toThrow("HTML push AI output must include title and summary.");
  });

  it("drops unsafe citation and key point URLs", () => {
    const parsed = parseHtmlPushStructuredContent(
      JSON.stringify({
        title: "AI update",
        subtitle: "Daily brief",
        summary: "A relevant update.",
        keyPoints: [{ title: "Launch", body: "New feature", url: "javascript:alert(1)" }],
        citations: [{ label: "Bad", url: "javascript:alert(1)" }],
      }),
    );

    expect(parsed.keyPoints[0]).not.toHaveProperty("url");
    expect(parsed.citations).toEqual([]);
  });

  it("returns deterministic fallback content without an AI provider", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousAiKey = process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;

    try {
      const content = await generateHtmlPushStructuredContent({
        topic: makeTopicRecord(),
        contentType: "brief",
        title: "AI update",
        summary: "A relevant update.",
        body: "The full brief body.",
        sourceUrls: ["https://example.com/source"],
        resolvedConfig: {
          enabled: true,
          entitlementStatus: "available",
          stylePreset: "minimal_news",
          modulePreset: "standard_summary",
          enabledModules: ["summary", "key_content", "citations"],
          customPrompt: null,
          publishTarget: "github",
          githubTokenEncrypted: "encrypted-token",
          githubRepo: "owner/repo",
          githubBranch: "main",
          githubBasePath: "inflowee/html",
          publicBaseUrl: null,
        },
        locale: "en",
      });

      expect(content).toMatchObject({
        title: "AI update",
        summary: "A relevant update.",
      });
      expect(content.keyPoints).toHaveLength(1);
      expect(content.citations).toEqual([
        { label: "Source 1", url: "https://example.com/source" },
      ]);
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
      if (previousAiKey === undefined) {
        delete process.env.AI_API_KEY;
      } else {
        process.env.AI_API_KEY = previousAiKey;
      }
    }
  });
});
