import * as cheerio from "cheerio";

export type ExtractedPage = {
  title: string;
  summary: string | null;
  canonicalUrl: string;
};

/**
 * Extract title, meta description, and body text from an HTML page.
 * Uses a priority chain: <article> → <main> → <body> for content.
 */
export function extractPageContent(
  html: string,
  url: string,
): ExtractedPage {
  const $ = cheerio.load(html);

  // Title: og:title → <title> → h1 → fallback
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    new URL(url).hostname;

  // Summary: og:description → meta description → first <p> in content
  const metaSummary =
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $('meta[name="description"]').attr("content")?.trim() ||
    null;

  // Content extraction: article → main → body
  const contentElement =
    $("article").first().length > 0
      ? $("article").first()
      : $("main").first().length > 0
        ? $("main").first()
        : $("body");

  // Remove noise elements
  contentElement.find("script, style, nav, header, footer, aside, form, iframe, noscript").remove();

  const bodyText = contentElement.text().replace(/\s+/g, " ").trim();

  // Use meta description if available, otherwise truncate body text
  const summary = metaSummary || (bodyText.length > 0 ? truncate(bodyText, 500) : null);

  // Canonical URL: <link rel="canonical"> → og:url → provided URL
  const canonicalUrl =
    $('link[rel="canonical"]').attr("href")?.trim() ||
    $('meta[property="og:url"]').attr("content")?.trim() ||
    url;

  return { title, summary, canonicalUrl };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3).trimEnd() + "...";
}
