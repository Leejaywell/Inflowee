import type { BriefRecord, ItemRecord } from "@/lib/store";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBriefHtmlDigest(input: {
  brief: BriefRecord;
  linkedItems: ItemRecord[];
}): string {
  const { brief, linkedItems } = input;

  const citations = brief.sourceCitations
    .map((citation) => {
      const safeCitation = escapeHtml(citation);
      return `<li><a href="${safeCitation}">${safeCitation}</a></li>`;
    })
    .join("");

  const tags = brief.tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");

  const linkedItemsHtml = linkedItems
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.title)}</strong>
        <div><a href="${escapeHtml(item.canonicalUrl)}">${escapeHtml(item.canonicalUrl)}</a></div>
        ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
      </li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(brief.title)}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #f4f1ea; color: #1c1917; }
      main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
      article { background: white; border-radius: 28px; padding: 32px; box-shadow: 0 24px 80px rgba(33, 24, 9, 0.08); }
      .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: #78716c; }
      .callout { background: #f5f5f4; border-radius: 20px; padding: 18px 20px; margin-top: 24px; }
      .meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
      .tag { display: inline-flex; padding: 6px 10px; border-radius: 999px; border: 1px solid #e7e5e4; font-size: 12px; color: #57534e; }
      a { color: #1d4ed8; text-decoration: none; }
      ul { padding-left: 20px; }
      li + li { margin-top: 8px; }
    </style>
  </head>
  <body>
    <main>
      <article>
        <div class="eyebrow">${escapeHtml(brief.topicTitle ?? "Unknown topic")}</div>
        <h1>${escapeHtml(brief.title)}</h1>
        <p>${escapeHtml(brief.summary)}</p>
        <div class="meta">
          <span class="tag">${brief.importanceScore >= 0.75 ? "Important" : "Signal"}</span>
          <span class="tag">Relevance ${Math.round(brief.relevanceScore * 100)}%</span>
          ${tags}
        </div>
        <div class="callout">
          <strong>Why it matters</strong>
          <p>${escapeHtml(brief.whyItMatters)}</p>
        </div>
        <h2>Source citations</h2>
        <ul>${citations}</ul>
        <h2>Linked items</h2>
        <ul>${linkedItemsHtml}</ul>
      </article>
    </main>
  </body>
</html>`;
}
