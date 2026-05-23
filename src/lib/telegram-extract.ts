import * as cheerio from "cheerio";

export type ExtractedTelegramMessage = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: string | null;
};

export type TelegramPublicDiagnostics = {
  items: ExtractedTelegramMessage[];
  warnings: string[];
  rawPreviewHtml: string;
};

export function extractTelegramPublicFeed(
  html: string,
  baseUrl: string,
): ExtractedTelegramMessage[] {
  return extractTelegramPublicDiagnostics(html, baseUrl).items;
}

export function extractTelegramPublicDiagnostics(
  html: string,
  baseUrl: string,
): TelegramPublicDiagnostics {
  const $ = cheerio.load(html);
  const items: ExtractedTelegramMessage[] = [];
  const warnings: string[] = [];

  $(".tgme_widget_message_wrap").each((_, element) => {
    const $message = $(element);
    const text = normalizeText(
      $message
        .find(".tgme_widget_message_text, .js-message_text, .tgme_widget_message_caption")
        .first()
        .text(),
    );
    const previewTitle = normalizeText(
      $message.find(".link_preview_title, .tgme_widget_message_author").first().text(),
    );
    const previewSummary = normalizeText(
      $message.find(".link_preview_description, .link_preview_site_name").first().text(),
    );
    const permalink =
      $message.find(".tgme_widget_message_date").attr("href")?.trim() ??
      $message.find("a[href*=\"/s/\"]").last().attr("href")?.trim() ??
      baseUrl;
    const publishedAt = $message.find("time").attr("datetime")?.trim() ?? null;
    const canonicalUrl = resolveUrl(permalink, baseUrl);
    const summary = text || previewSummary || null;
    const title = text ? truncate(text, 90) : previewTitle || "Telegram message";

    if (!summary && !previewTitle) {
      return;
    }

    items.push({
      title,
      canonicalUrl,
      summary: summary ? truncate(summary, 320) : null,
      publishedAt,
    });
  });

  if (items.length === 0) {
    warnings.push("no telegram messages extracted");
  }

  if (items.some((item) => !item.summary)) {
    warnings.push("missing summary on one or more telegram messages");
  }

  if (items.some((item) => !item.publishedAt)) {
    warnings.push("missing published date on one or more telegram messages");
  }

  return {
    items: items.slice(0, 12),
    warnings,
    rawPreviewHtml:
      $(".tgme_channel_history").html()?.slice(0, 500) ??
      $(".tgme_widget_message_wrap").first().html()?.slice(0, 500) ??
      html.slice(0, 500),
  };
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function resolveUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return baseUrl;
  }
}
