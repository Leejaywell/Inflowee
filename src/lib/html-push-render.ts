import type { HtmlPushStructuredContent } from "@/lib/html-push-generation";
import type {
  HtmlPushModule,
  HtmlPushStylePreset,
  TopicRecord,
} from "@/lib/store";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function styleForPreset(preset: HtmlPushStylePreset) {
  const palettes: Record<HtmlPushStylePreset, string> = {
    minimal_news:
      "body{background:#f7f6f2;color:#171717}.hero{border-bottom:3px solid #171717}.card{background:#fff;border:1px solid #ddd}",
    tech_radar:
      "body{background:#09111f;color:#edf3ff}.hero{background:#10264a}.card{background:#111d32;border:1px solid #315fba}",
    investment_brief:
      "body{background:#f8f7f1;color:#172013}.hero{border-bottom:4px double #68745c}.card{background:#fffdf7;border:1px solid #d7d1bd}",
    newsletter:
      "body{background:#fffaf2;color:#222}.hero{border-bottom:1px solid #e8dcc8}.card{background:#fff;border:1px solid #eadfce}",
    magazine_cards:
      "body{background:#111;color:#f8f3ea}.hero{background:#f0c15c;color:#111}.card{background:#1f1f1f;border:1px solid #444}",
  };

  return palettes[preset];
}

function renderSection(title: string, body: string) {
  if (!body) {
    return "";
  }

  return `<section class="section"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></section>`;
}

function renderList(title: string, rows: string[]) {
  if (rows.length === 0) {
    return "";
  }

  return `<section class="section"><h2>${escapeHtml(title)}</h2><ul>${rows
    .map((row) => `<li>${escapeHtml(row)}</li>`)
    .join("")}</ul></section>`;
}

export function renderHtmlPushDocument(input: {
  content: HtmlPushStructuredContent;
  topic: TopicRecord;
  contentType: "brief" | "report";
  contentId: string;
  stylePreset: HtmlPushStylePreset;
  enabledModules: HtmlPushModule[];
  generatedAt: Date;
}): string {
  const modules = new Set(input.enabledModules);
  const keyPoints = modules.has("key_content")
    ? input.content.keyPoints
        .map((point) => {
          const url = safeUrl(point.url);
          return `<article class="card"><h3>${escapeHtml(point.title)}</h3><p>${escapeHtml(point.body)}</p>${
            url
              ? `<a href="${escapeHtml(url)}" rel="noreferrer" target="_blank">Read source</a>`
              : ""
          }</article>`;
        })
        .join("")
    : "";
  const citations = modules.has("citations")
    ? input.content.citations
        .map((citation) => {
          const url = safeUrl(citation.url);
          return url
            ? `<li><a href="${escapeHtml(url)}" rel="noreferrer" target="_blank">${escapeHtml(citation.label)}</a></li>`
            : "";
        })
        .join("")
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.content.title)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}main{max-width:980px;margin:0 auto;padding:40px 20px 56px}.hero{padding:32px 0 28px;margin-bottom:28px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.14em;opacity:.7}h1{font-size:clamp(32px,5vw,64px);line-height:1.02;margin:10px 0 14px}h2{font-size:22px;margin:0 0 12px}h3{font-size:18px;margin:0 0 8px}.section{margin:28px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.card{border-radius:8px;padding:18px}.meta{font-size:13px;opacity:.68}a{color:inherit;font-weight:700}footer{margin-top:44px;padding-top:18px;border-top:1px solid currentColor;font-size:13px;opacity:.65}
    ${styleForPreset(input.stylePreset)}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <div class="eyebrow">${escapeHtml(input.topic.title)} / ${escapeHtml(input.contentType)}</div>
      <h1>${escapeHtml(input.content.title)}</h1>
      <p>${escapeHtml(input.content.subtitle)}</p>
      <p class="meta">${escapeHtml(input.generatedAt.toISOString())} / ${escapeHtml(input.contentId)}</p>
    </header>
    ${
      modules.has("summary")
        ? renderSection("Summary", input.content.summary)
        : ""
    }
    ${keyPoints ? `<section class="section"><h2>Key Content</h2><div class="grid">${keyPoints}</div></section>` : ""}
    ${
      modules.has("ai_conclusion")
        ? renderSection("AI Conclusion", input.content.aiConclusion ?? "")
        : ""
    }
    ${
      modules.has("trend_changes")
        ? renderList("Trend Changes", input.content.trendChanges)
        : ""
    }
    ${
      modules.has("recommended_actions")
        ? renderList("Recommended Actions", input.content.recommendedActions)
        : ""
    }
    ${citations ? `<section class="section"><h2>Sources</h2><ul>${citations}</ul></section>` : ""}
    <footer>Generated by Inflowee</footer>
  </main>
</body>
</html>`;
}
