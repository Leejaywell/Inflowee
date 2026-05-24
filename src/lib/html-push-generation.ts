import { callOpenAIJsonCompletion } from "@/lib/ai";
import type { ResolvedHtmlPushConfig } from "@/lib/html-push-config";
import { getAiProviderConfig } from "@/lib/ai-config";
import type { TopicRecord } from "@/lib/store";

export type HtmlPushStructuredContent = {
  title: string;
  subtitle: string;
  summary: string;
  keyPoints: Array<{ title: string; body: string; url?: string }>;
  aiConclusion?: string;
  trendChanges: string[];
  recommendedActions: string[];
  citations: Array<{ label: string; url: string }>;
};

export type GenerateHtmlPushInput = {
  topic: TopicRecord;
  contentType: "brief" | "report";
  title: string;
  summary: string;
  body: string;
  sourceUrls: string[];
  resolvedConfig: ResolvedHtmlPushConfig;
  locale: "zh" | "en";
};

function isSafeHttpUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean).slice(0, limit)
    : [];
}

export function parseHtmlPushStructuredContent(
  raw: string,
): HtmlPushStructuredContent {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const title = asString(parsed.title);
  const subtitle = asString(parsed.subtitle);
  const summary = asString(parsed.summary);

  if (!title || !summary) {
    throw new Error("HTML push AI output must include title and summary.");
  }

  const keyPoints = Array.isArray(parsed.keyPoints)
    ? parsed.keyPoints
        .map((point) => {
          const record = point as Record<string, unknown>;
          const pointTitle = asString(record.title);
          const body = asString(record.body);
          const url = asString(record.url);

          if (!pointTitle || !body) {
            return null;
          }

          return {
            title: pointTitle,
            body,
            ...(isSafeHttpUrl(url) ? { url } : {}),
          };
        })
        .filter((point): point is { title: string; body: string; url?: string } =>
          Boolean(point),
        )
        .slice(0, 8)
    : [];

  const citations = Array.isArray(parsed.citations)
    ? parsed.citations
        .map((citation) => {
          const record = citation as Record<string, unknown>;
          const label = asString(record.label);
          const url = asString(record.url);

          if (!label || !isSafeHttpUrl(url)) {
            return null;
          }

          return { label, url };
        })
        .filter((citation): citation is { label: string; url: string } =>
          Boolean(citation),
        )
        .slice(0, 12)
    : [];

  return {
    title,
    subtitle,
    summary,
    keyPoints,
    aiConclusion: asString(parsed.aiConclusion) || undefined,
    trendChanges: asStringArray(parsed.trendChanges, 6),
    recommendedActions: asStringArray(parsed.recommendedActions, 6),
    citations,
  };
}

function buildFallbackContent(
  input: GenerateHtmlPushInput,
): HtmlPushStructuredContent {
  return {
    title: input.title,
    subtitle:
      input.locale === "zh"
        ? `${input.topic.title} 的${input.contentType === "brief" ? "简报" : "报告"}摘要`
        : `${input.contentType === "brief" ? "Brief" : "Report"} summary for ${input.topic.title}`,
    summary: input.summary,
    keyPoints: [
      {
        title:
          input.locale === "zh"
            ? "核心内容"
            : "Key content",
        body: input.body.slice(0, 800),
        ...(isSafeHttpUrl(input.sourceUrls[0])
          ? { url: input.sourceUrls[0] }
          : {}),
      },
    ],
    aiConclusion: input.summary,
    trendChanges: [],
    recommendedActions: [],
    citations: input.sourceUrls
      .filter(isSafeHttpUrl)
      .slice(0, 12)
      .map((url, index) => ({ label: `Source ${index + 1}`, url })),
  };
}

export async function generateHtmlPushStructuredContent(
  input: GenerateHtmlPushInput,
): Promise<HtmlPushStructuredContent> {
  if (!getAiProviderConfig().configured) {
    return buildFallbackContent(input);
  }

  const language = input.locale === "zh" ? "Chinese" : "English";
  const raw = await callOpenAIJsonCompletion([
    {
      role: "system",
      content: `Generate structured JSON for an Inflowee HTML push summary.
Return only JSON with keys: title, subtitle, summary, keyPoints, aiConclusion, trendChanges, recommendedActions, citations.
Do not return raw HTML. Write in ${language}.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        topic: {
          title: input.topic.title,
          prompt: input.topic.userPrompt,
        },
        contentType: input.contentType,
        title: input.title,
        summary: input.summary,
        body: input.body.slice(0, 12000),
        sourceUrls: input.sourceUrls,
        stylePreset: input.resolvedConfig.stylePreset,
        enabledModules: input.resolvedConfig.enabledModules,
        customPrompt: input.resolvedConfig.customPrompt,
      }),
    },
  ]);

  return parseHtmlPushStructuredContent(raw);
}
