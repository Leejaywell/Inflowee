/// <reference types="vitest/globals" />

import {
  buildHtmlPushSkippedReason,
  getDefaultHtmlPushModules,
  mergeHtmlPushSettings,
} from "@/lib/html-push-config";
import type {
  HtmlPushConfigRecord,
  TopicHtmlPushConfigRecord,
} from "@/lib/store";

const baseGlobalConfig: HtmlPushConfigRecord = {
  id: "config-1",
  ownerId: "user-1",
  enabled: true,
  entitlementStatus: "available",
  stylePreset: "minimal_news",
  modulePreset: "standard_summary",
  enabledModules: ["summary", "key_content", "citations"],
  customPrompt: "Write for operators.",
  publishTarget: "github",
  githubTokenEncrypted: "encrypted-token",
  githubRepo: "owner/repo",
  githubBranch: "main",
  githubBasePath: "inflowee/html",
  publicBaseUrl: "https://example.com",
  createdAt: "2026-05-25T00:00:00.000Z",
  updatedAt: "2026-05-25T00:00:00.000Z",
};

describe("HTML push config", () => {
  it("returns deterministic modules for presets", () => {
    expect(getDefaultHtmlPushModules("standard_summary")).toEqual([
      "summary",
      "key_content",
      "citations",
    ]);
    expect(getDefaultHtmlPushModules("analysis_report")).toContain(
      "ai_conclusion",
    );
    expect(getDefaultHtmlPushModules("news_flash")).toEqual([
      "summary",
      "key_content",
      "original_links",
    ]);
  });

  it("uses topic override for content settings while keeping global GitHub settings", () => {
    const topicConfig: TopicHtmlPushConfigRecord = {
      id: "topic-config-1",
      topicId: "topic-1",
      useGlobal: false,
      enabled: true,
      stylePreset: "tech_radar",
      modulePreset: "analysis_report",
      enabledModules: ["summary", "ai_conclusion"],
      customPrompt: "Focus on trend changes.",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    const resolved = mergeHtmlPushSettings({
      globalConfig: baseGlobalConfig,
      topicConfig,
    });

    expect(resolved).toMatchObject({
      enabled: true,
      stylePreset: "tech_radar",
      modulePreset: "analysis_report",
      githubRepo: "owner/repo",
      githubTokenEncrypted: "encrypted-token",
    });
    expect(resolved.enabledModules).toEqual(["summary", "ai_conclusion"]);
  });

  it("reports disabled entitlement as skipped", () => {
    const resolved = mergeHtmlPushSettings({
      globalConfig: {
        ...baseGlobalConfig,
        entitlementStatus: "upgrade_required",
      },
      topicConfig: null,
    });

    expect(buildHtmlPushSkippedReason(resolved)).toBe(
      "HTML push enhancement entitlement is not available.",
    );
  });
});
