import * as cheerio from "cheerio";

export type ExtractedUpdateEntry = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: string | null;
};

export function extractUpdateEntries(
  html: string,
  baseUrl: string,
): ExtractedUpdateEntry[] {
  const $ = cheerio.load(html);
  const items: ExtractedUpdateEntry[] = [];
  const seen = new Set<string>();

  const sections = $("article, section, li");

  sections.each((index, element) => {
    const section = $(element);
    const heading = section.find("h1, h2, h3, h4").first();
    const link = section.find("a[href]").first();
    const title = heading.text().trim() || link.text().trim();
    const href = link.attr("href");

    if (!title || !href) {
      return;
    }

    const canonicalUrl = new URL(href, baseUrl).href;
    if (seen.has(canonicalUrl)) {
      return;
    }

    const summaryText = section
      .find("p")
      .map((_, p) => $(p).text().trim())
      .get()
      .join(" ")
      .trim();

    const publishedAt =
      section.find("time").attr("datetime")?.trim() ?? new Date().toISOString();

    items.push({
      title,
      canonicalUrl,
      summary: summaryText || null,
      publishedAt,
    });
    seen.add(canonicalUrl);

    if (index >= 14) {
      return false;
    }
  });

  if (items.length > 0) {
    return items;
  }

  const pageTitle = $("title").text().trim() || new URL(baseUrl).hostname;
  const summary =
    $('meta[name="description"]').attr("content")?.trim() ||
    $("main p, article p, body p")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim() ||
    null;

  return [
    {
      title: pageTitle,
      canonicalUrl: baseUrl,
      summary,
      publishedAt: new Date().toISOString(),
    },
  ];
}
