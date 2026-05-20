import { NextResponse } from "next/server";

import { defaultStore, listBriefs } from "@/lib/store";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ briefId: string }> },
) {
  const { briefId } = await context.params;
  const brief = listBriefs(defaultStore).find((entry) => entry.id === briefId);

  if (!brief) {
    return new NextResponse("Brief not found", { status: 404 });
  }

  const citations = brief.sourceCitations
    .map((citation) => {
      const safeCitation = escapeHtml(citation);
      return `<li><a href="${safeCitation}">${safeCitation}</a></li>`;
    })
    .join("");

  const html = `<!doctype html>
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
      a { color: #1d4ed8; text-decoration: none; }
      ul { padding-left: 20px; }
      li + li { margin-top: 8px; }
    </style>
  </head>
  <body>
    <main>
      <article>
        <div class="eyebrow">${escapeHtml(brief.spaceName ?? "Unknown space")} / ${escapeHtml(brief.taskTitle ?? "Unknown task")}</div>
        <h1>${escapeHtml(brief.title)}</h1>
        <p>${escapeHtml(brief.summary)}</p>
        <div class="callout">
          <strong>Why it matters</strong>
          <p>${escapeHtml(brief.whyItMatters)}</p>
        </div>
        <ul>${citations}</ul>
      </article>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
