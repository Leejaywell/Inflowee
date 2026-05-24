import * as cheerio from "cheerio";
import { getAiProviderConfig } from "@/lib/ai-config";

export type ExtractedListItem = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: string | null;
};

export type StructuredListDiagnostics = {
  items: ExtractedListItem[];
  warnings: string[];
  rawPreviewHtml: string;
};

export async function extractStructuredList(
  html: string,
  baseUrl: string
): Promise<ExtractedListItem[]> {
  const diagnostics = await extractStructuredListDiagnostics(html, baseUrl);

  return diagnostics.items;
}

export async function extractStructuredListDiagnostics(
  html: string,
  baseUrl: string
): Promise<StructuredListDiagnostics> {
  if (getAiProviderConfig().configured) {
    try {
      // Remove scripts, styles, navs, footers to clean up the content
      const $ = cheerio.load(html);
      $("script, style, iframe, nav, footer, header").remove();
      
      const cleanHtml = $("body").html() || html;
      const slicedHtml = cleanHtml.slice(0, 30000);

      const systemPrompt = `You are Inflowee Structured List Extractor. You extract a list of distinct structured items (e.g., jobs, startup launches, product announcements) from the provided HTML page.
Each item must contain:
1. "title": The name/title of the post/listing.
2. "canonicalUrl": Absolute URL of the listing detail page (resolve relative URLs using base URL "${baseUrl}").
3. "summary": A brief one-sentence summary of the listing (max 40 words).

Respond in strict JSON format:
{
  "items": [
    {
      "title": "Item Name",
      "canonicalUrl": "https://example.com/item-details",
      "summary": "Short summary of the item."
    }
  ]
}`;
      const responseText = await callOpenAIChatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: `HTML content:\n${slicedHtml}` },
      ], true);

      const parsed = JSON.parse(responseText);
      if (parsed && Array.isArray(parsed.items)) {
        const items = parsed.items.map((item: { title?: string; canonicalUrl?: string; summary?: string }) => ({
          title: item.title || "Untitled",
          canonicalUrl: item.canonicalUrl || baseUrl,
          summary: item.summary || null,
          publishedAt: new Date().toISOString(),
        }));

        return {
          items,
          warnings: collectStructuredWarnings(items, slicedHtml),
          rawPreviewHtml: slicedHtml.slice(0, 500),
        };
      }
    } catch (e) {
      console.warn("Real OpenAI failed in extractStructuredList, using heuristics fallback", e);
    }
  }

  // Heuristics Fallback Engine
  const $ = cheerio.load(html);
  const items: ExtractedListItem[] = [];
  const visitedUrls = new Set<string>();

  const resolveUrl = (href: string) => {
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return href;
    }
  };

  // Strategy 1: Look for common repeating containers (article, tr, li, divs with classes like post, item, card)
  const selectors = [
    "[class*='job-card']",
    "[class*='job-primary']",
    "[class*='job-item']",
    "[class*='job_list'] li",
    "[class*='job-list'] li",
    "[class*='position-card']",
    "[class*='position-item']",
    "[class*='position']",
    "article",
    "tr",
    "li",
    ".post",
    ".item",
    ".card",
    "[class*='item']",
    "[class*='post']",
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const $el = $(element);
      
      // Avoid taking the entire list container if it matches a broad selector
      if (selector === "li" && $el.find("li").length > 0) return;
      if (selector === "article" && $el.find("article").length > 0) return;

      const $link = $el.find("a").first();
      const href = $link.attr("href");
      if (!href) return;

      const resolved = resolveUrl(href);
      if (resolved.startsWith("javascript:") || resolved === baseUrl || visitedUrls.has(resolved)) {
        return;
      }

      let title = "";
      const $heading = $el.find("h1, h2, h3, h4, h5, h6").first();
      if ($heading.length > 0) {
        title = $heading.text().trim();
      } else {
        title = $link.text().trim();
      }

      if (!title || title.length < 3) {
        title = $el.text().trim().split("\n")[0].trim().slice(0, 80);
      }

      if (!title || title.length < 3) return;

      let summary = "";
      let $p = $el.find("p, .summary, .description, [class*='desc']").first();
      if ($p.length === 0) {
        $p = $el.find("span").first();
      }
      if ($p.length > 0) {
        summary = $p.text().trim();
      } else {
        summary = $el.text().replace(title, "").replace(/\s+/g, " ").trim().slice(0, 150);
      }

      title = title.replace(/\s+/g, " ").trim();
      summary = summary.replace(/\s+/g, " ").trim();

      if (title.length > 150) title = title.slice(0, 147) + "...";
      if (summary.length > 300) summary = summary.slice(0, 297) + "...";

      items.push({
        title,
        canonicalUrl: resolved,
        summary: summary || null,
        publishedAt: new Date().toISOString(),
      });
      visitedUrls.add(resolved);
    });

    if (items.length >= 3) {
      break; // Found matching repeated elements!
    }
  }

  // Strategy 2: If Strategy 1 yielded nothing, fall back to parsing all anchors with substantial text
  if (items.length === 0) {
    $("a").each((_, element) => {
      const $el = $(element);
      const href = $el.attr("href");
      if (!href) return;

      const resolved = resolveUrl(href);
      if (
        resolved.startsWith("javascript:") ||
        resolved === baseUrl ||
        resolved.includes("#") ||
        visitedUrls.has(resolved)
      ) {
        return;
      }

      let title = $el.text().trim();
      if (!title || title.length < 6) return;

      let summary = "";
      const $parent = $el.parent();
      if ($parent.text().length > title.length + 10) {
        summary = $parent.text().replace(title, "").replace(/\s+/g, " ").trim().slice(0, 150);
      }

      title = title.replace(/\s+/g, " ").trim();
      if (title.length > 150) title = title.slice(0, 147) + "...";

      items.push({
        title,
        canonicalUrl: resolved,
        summary: summary || null,
        publishedAt: new Date().toISOString(),
      });
      visitedUrls.add(resolved);
    });
  }

  const finalItems = items.slice(0, 15);

  return {
    items: finalItems,
    warnings: collectStructuredWarnings(finalItems, html),
    rawPreviewHtml: html.slice(0, 500),
  };
}

function collectStructuredWarnings(items: ExtractedListItem[], html: string) {
  const warnings: string[] = [];

  if (items.length === 0) {
    warnings.push("no list items extracted");
  }

  if (items.some((item) => !item.summary)) {
    warnings.push("missing summary on one or more items");
  }

  if (
    items.some((item) => !item.publishedAt) ||
    !/(<time\b|datetime=|published|posted)/i.test(html)
  ) {
    warnings.push("missing published date");
  }

  return warnings;
}

async function callOpenAIChatCompletion(messages: Array<{ role: string; content: string }>, jsonMode = false): Promise<string> {
  const config = getAiProviderConfig();
  if (!config.apiKey) {
    throw new Error("Missing OPENAI_API_KEY or AI_API_KEY");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      response_format: jsonMode ? { type: "json_object" } : undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${config.provider} API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "";
}
