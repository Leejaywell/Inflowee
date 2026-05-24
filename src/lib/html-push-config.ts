import type {
  HtmlPushConfigRecord,
  HtmlPushModule,
  HtmlPushModulePreset,
  HtmlPushStylePreset,
  TopicHtmlPushConfigRecord,
} from "@/lib/store";

export const HTML_PUSH_STYLE_PRESETS = [
  "minimal_news",
  "tech_radar",
  "investment_brief",
  "newsletter",
  "magazine_cards",
] as const satisfies readonly HtmlPushStylePreset[];

export const HTML_PUSH_MODULE_PRESETS = [
  "standard_summary",
  "analysis_report",
  "news_flash",
] as const satisfies readonly HtmlPushModulePreset[];

export const HTML_PUSH_MODULES = [
  "summary",
  "key_content",
  "ai_conclusion",
  "trend_changes",
  "citations",
  "original_links",
  "recommended_actions",
] as const satisfies readonly HtmlPushModule[];

export type ResolvedHtmlPushConfig = {
  enabled: boolean;
  entitlementStatus: HtmlPushConfigRecord["entitlementStatus"];
  stylePreset: HtmlPushStylePreset;
  modulePreset: HtmlPushModulePreset;
  enabledModules: HtmlPushModule[];
  customPrompt: string | null;
  publishTarget: "github";
  githubTokenEncrypted: string | null;
  githubRepo: string | null;
  githubBranch: string;
  githubBasePath: string;
  publicBaseUrl: string | null;
};

export function getDefaultHtmlPushModules(
  preset: HtmlPushModulePreset,
): HtmlPushModule[] {
  if (preset === "analysis_report") {
    return [
      "summary",
      "key_content",
      "ai_conclusion",
      "trend_changes",
      "recommended_actions",
      "citations",
    ];
  }

  if (preset === "news_flash") {
    return ["summary", "key_content", "original_links"];
  }

  return ["summary", "key_content", "citations"];
}

export function mergeHtmlPushSettings(input: {
  globalConfig: HtmlPushConfigRecord | null;
  topicConfig: TopicHtmlPushConfigRecord | null;
}): ResolvedHtmlPushConfig {
  const globalConfig = input.globalConfig;
  const topicConfig = input.topicConfig;

  if (!globalConfig) {
    return {
      enabled: false,
      entitlementStatus: "disabled",
      stylePreset: "minimal_news",
      modulePreset: "standard_summary",
      enabledModules: getDefaultHtmlPushModules("standard_summary"),
      customPrompt: null,
      publishTarget: "github",
      githubTokenEncrypted: null,
      githubRepo: null,
      githubBranch: "main",
      githubBasePath: "inflowee/html",
      publicBaseUrl: null,
    };
  }

  if (!topicConfig || topicConfig.useGlobal) {
    return {
      enabled: globalConfig.enabled,
      entitlementStatus: globalConfig.entitlementStatus,
      stylePreset: globalConfig.stylePreset,
      modulePreset: globalConfig.modulePreset,
      enabledModules: globalConfig.enabledModules,
      customPrompt: globalConfig.customPrompt,
      publishTarget: globalConfig.publishTarget,
      githubTokenEncrypted: globalConfig.githubTokenEncrypted,
      githubRepo: globalConfig.githubRepo,
      githubBranch: globalConfig.githubBranch,
      githubBasePath: globalConfig.githubBasePath,
      publicBaseUrl: globalConfig.publicBaseUrl,
    };
  }

  return {
    enabled: topicConfig.enabled,
    entitlementStatus: globalConfig.entitlementStatus,
    stylePreset: topicConfig.stylePreset,
    modulePreset: topicConfig.modulePreset,
    enabledModules: topicConfig.enabledModules,
    customPrompt: topicConfig.customPrompt,
    publishTarget: globalConfig.publishTarget,
    githubTokenEncrypted: globalConfig.githubTokenEncrypted,
    githubRepo: globalConfig.githubRepo,
    githubBranch: globalConfig.githubBranch,
    githubBasePath: globalConfig.githubBasePath,
    publicBaseUrl: globalConfig.publicBaseUrl,
  };
}

export function isHtmlPushEnabled(config: ResolvedHtmlPushConfig): boolean {
  return (
    config.enabled &&
    config.entitlementStatus === "available" &&
    Boolean(
      config.githubTokenEncrypted &&
        config.githubRepo &&
        config.githubBranch &&
        config.githubBasePath,
    )
  );
}

export function buildHtmlPushSkippedReason(
  config: ResolvedHtmlPushConfig,
): string | null {
  if (!config.enabled) {
    return "HTML push enhancement is disabled.";
  }

  if (config.entitlementStatus !== "available") {
    return "HTML push enhancement entitlement is not available.";
  }

  if (
    !config.githubTokenEncrypted ||
    !config.githubRepo ||
    !config.githubBranch ||
    !config.githubBasePath
  ) {
    return "GitHub publishing is not configured.";
  }

  return null;
}
