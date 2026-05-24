import {
  buildHtmlPushSkippedReason,
  isHtmlPushEnabled,
  mergeHtmlPushSettings,
} from "@/lib/html-push-config";
import { generateHtmlPushStructuredContent } from "@/lib/html-push-generation";
import {
  buildHtmlPublishPath,
  GitHubHtmlPublisher,
} from "@/lib/html-publisher";
import { renderHtmlPushDocument } from "@/lib/html-push-render";
import { decryptSecret } from "@/lib/secret-box";
import {
  createHtmlPublication,
  getBriefById,
  getHtmlPublicationByContent,
  getHtmlPushConfig,
  getReportById,
  getTopicById,
  getTopicHtmlPushConfig,
  listBriefsFiltered,
  listItemsByBriefId,
  listReportsByTopic,
  type BriefRecord,
  type ReportRecord,
  type Store,
  type TopicRecord,
  updateHtmlPublication,
} from "@/lib/store";

export type HtmlPushDeliveryInput =
  | {
      contentType: "brief";
      briefId: string;
    }
  | {
      contentType: "report";
      reportId: string;
    };

export type HtmlPushDeliveryResult =
  | { status: "skipped"; reason: string }
  | { status: "published"; publicationId: string; htmlUrl: string }
  | { status: "failed"; publicationId?: string; error: string };

export type HtmlPushPreviewResult =
  | { status: "generated"; publicationId: string }
  | { status: "unavailable"; reason: string };

type DeliveryContent = {
  topic: TopicRecord;
  contentType: "brief" | "report";
  contentId: string;
  title: string;
  summary: string;
  body: string;
  sourceUrls: string[];
  briefId?: string | null;
  reportId?: string | null;
};

async function loadDeliveryContent(
  store: Store,
  input: HtmlPushDeliveryInput,
): Promise<DeliveryContent> {
  if (input.contentType === "brief") {
    const brief = await getBriefById(store, input.briefId);

    if (!brief) {
      throw new Error("Brief not found.");
    }

    const topic = await getTopicById(store, brief.topicId);
    if (!topic) {
      throw new Error("Topic not found.");
    }

    const linkedItems = await listItemsByBriefId(store, brief.id);
    return {
      topic,
      contentType: "brief",
      contentId: brief.id,
      briefId: brief.id,
      title: brief.title,
      summary: brief.summary,
      body: buildBriefBody(brief),
      sourceUrls: [
        ...brief.sourceCitations,
        ...linkedItems.map((item) => item.canonicalUrl),
      ],
    };
  }

  const report = await getReportById(store, input.reportId);
  if (!report) {
    throw new Error("Report not found.");
  }

  const topic = await getTopicById(store, report.topicId);
  if (!topic) {
    throw new Error("Topic not found.");
  }

  return {
    topic,
    contentType: "report",
    contentId: report.id,
    reportId: report.id,
    title: report.title,
    summary: report.summary,
    body: buildReportBody(report),
    sourceUrls: report.sourceCitations,
  };
}

function buildBriefBody(brief: BriefRecord) {
  return [
    brief.summary,
    brief.whyItMatters,
    ...brief.tags.map((tag) => `#${tag}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildReportBody(report: ReportRecord) {
  return report.markdown || report.summary;
}

function getPreviewResolvedConfig(input: {
  globalConfig: Awaited<ReturnType<typeof getHtmlPushConfig>>;
  topicConfig: Awaited<ReturnType<typeof getTopicHtmlPushConfig>>;
}) {
  if (input.globalConfig) {
    return mergeHtmlPushSettings(input);
  }

  if (input.topicConfig && !input.topicConfig.useGlobal) {
    return {
      enabled: input.topicConfig.enabled,
      entitlementStatus: "available" as const,
      stylePreset: input.topicConfig.stylePreset,
      modulePreset: input.topicConfig.modulePreset,
      enabledModules: input.topicConfig.enabledModules,
      customPrompt: input.topicConfig.customPrompt,
      publishTarget: "github" as const,
      githubTokenEncrypted: null,
      githubRepo: null,
      githubBranch: "main",
      githubBasePath: "inflowee/html",
      publicBaseUrl: null,
    };
  }

  return mergeHtmlPushSettings(input);
}

export async function previewTopicHtmlPublication(
  store: Store,
  topicId: string,
  options: {
    now?: Date;
    locale?: "zh" | "en";
  } = {},
): Promise<HtmlPushPreviewResult> {
  const topic = await getTopicById(store, topicId);

  if (!topic) {
    throw new Error("Topic not found.");
  }

  const [briefs, reports, globalConfig, topicConfig] = await Promise.all([
    listBriefsFiltered(store, { topicId }),
    listReportsByTopic(store, topicId),
    getHtmlPushConfig(store, topic.ownerId),
    getTopicHtmlPushConfig(store, topic.id),
  ]);
  const latestBrief = briefs[0];
  const latestReport = reports[0];

  if (!latestBrief && !latestReport) {
    return {
      status: "unavailable",
      reason: "No eligible Brief or Report is available for preview.",
    };
  }

  const content = latestBrief
    ? await loadDeliveryContent(store, {
        contentType: "brief",
        briefId: latestBrief.id,
      })
    : await loadDeliveryContent(store, {
        contentType: "report",
        reportId: latestReport.id,
      });
  const resolvedConfig = getPreviewResolvedConfig({ globalConfig, topicConfig });
  const structuredContent = await generateHtmlPushStructuredContent({
    topic: content.topic,
    contentType: content.contentType,
    title: content.title,
    summary: content.summary,
    body: content.body,
    sourceUrls: content.sourceUrls,
    resolvedConfig,
    locale: options.locale ?? "zh",
  });
  const html = renderHtmlPushDocument({
    content: structuredContent,
    topic: content.topic,
    contentType: content.contentType,
    contentId: content.contentId,
    stylePreset: resolvedConfig.stylePreset,
    enabledModules: resolvedConfig.enabledModules,
    generatedAt: options.now ?? new Date(),
  });
  const previewId = await createHtmlPublication(store, {
    ownerId: topic.ownerId,
    topicId: topic.id,
    briefId: content.briefId ?? null,
    reportId: content.reportId ?? null,
    contentType: content.contentType,
    contentId: `${content.contentId}:preview:${Date.now()}`,
    status: "generated",
    title: structuredContent.title,
    html,
    styleConfig: { stylePreset: resolvedConfig.stylePreset },
    moduleConfig: {
      modulePreset: resolvedConfig.modulePreset,
      enabledModules: resolvedConfig.enabledModules,
      previewForContentId: content.contentId,
    },
  });

  return { status: "generated", publicationId: previewId };
}

export async function maybeCreateHtmlPublicationForDelivery(
  store: Store,
  input: HtmlPushDeliveryInput,
  options: {
    fetchImpl?: typeof fetch;
    now?: Date;
    locale?: "zh" | "en";
  } = {},
): Promise<HtmlPushDeliveryResult> {
  const content = await loadDeliveryContent(store, input);
  const existing = await getHtmlPublicationByContent(store, {
    contentType: content.contentType,
    contentId: content.contentId,
  });

  if (existing?.status === "published" && existing.htmlUrl) {
    return {
      status: "published",
      publicationId: existing.id,
      htmlUrl: existing.htmlUrl,
    };
  }

  const [globalConfig, topicConfig] = await Promise.all([
    getHtmlPushConfig(store, content.topic.ownerId),
    getTopicHtmlPushConfig(store, content.topic.id),
  ]);
  const resolvedConfig = mergeHtmlPushSettings({ globalConfig, topicConfig });
  const skippedReason = buildHtmlPushSkippedReason(resolvedConfig);

  if (!isHtmlPushEnabled(resolvedConfig) && skippedReason) {
    return { status: "skipped", reason: skippedReason };
  }

  let publicationId = existing?.id;

  try {
    if (!publicationId) {
      publicationId = await createHtmlPublication(store, {
        ownerId: content.topic.ownerId,
        topicId: content.topic.id,
        briefId: content.briefId ?? null,
        reportId: content.reportId ?? null,
        contentType: content.contentType,
        contentId: content.contentId,
        status: "pending",
        styleConfig: { stylePreset: resolvedConfig.stylePreset },
        moduleConfig: {
          modulePreset: resolvedConfig.modulePreset,
          enabledModules: resolvedConfig.enabledModules,
        },
      });
    }

    const structuredContent = await generateHtmlPushStructuredContent({
      topic: content.topic,
      contentType: content.contentType,
      title: content.title,
      summary: content.summary,
      body: content.body,
      sourceUrls: content.sourceUrls,
      resolvedConfig,
      locale: options.locale ?? "zh",
    });
    const html = renderHtmlPushDocument({
      content: structuredContent,
      topic: content.topic,
      contentType: content.contentType,
      contentId: content.contentId,
      stylePreset: resolvedConfig.stylePreset,
      enabledModules: resolvedConfig.enabledModules,
      generatedAt: options.now ?? new Date(),
    });
    await updateHtmlPublication(store, publicationId, {
      status: "generated",
      title: structuredContent.title,
      html,
      styleConfig: { stylePreset: resolvedConfig.stylePreset },
      moduleConfig: {
        modulePreset: resolvedConfig.modulePreset,
        enabledModules: resolvedConfig.enabledModules,
      },
    });

    const publishPath = buildHtmlPublishPath({
      basePath: resolvedConfig.githubBasePath,
      topicTitle: content.topic.title,
      contentType: content.contentType,
      contentId: content.contentId,
    });
    const publisher = new GitHubHtmlPublisher({
      token: decryptSecret(resolvedConfig.githubTokenEncrypted ?? ""),
      repo: resolvedConfig.githubRepo ?? "",
      branch: resolvedConfig.githubBranch,
      publicBaseUrl: resolvedConfig.publicBaseUrl,
      fetchImpl: options.fetchImpl,
    });
    const result = await publisher.publish({
      html,
      path: publishPath,
      title: structuredContent.title,
      commitMessage: `Publish Inflowee HTML summary for ${content.topic.title}`,
    });

    await updateHtmlPublication(store, publicationId, {
      status: "published",
      htmlUrl: result.url,
      publishPath: result.path,
      commitSha: result.commitSha ?? null,
      error: null,
      publishedAt: (options.now ?? new Date()).toISOString(),
    });

    return {
      status: "published",
      publicationId,
      htmlUrl: result.url,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown HTML publish failure.";

    if (publicationId) {
      await updateHtmlPublication(store, publicationId, {
        status: "failed",
        error: message,
      });
    }

    return {
      status: "failed",
      publicationId,
      error: message,
    };
  }
}
