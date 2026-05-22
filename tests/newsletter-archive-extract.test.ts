/// <reference types="vitest/globals" />

import { extractNewsletterArchiveEntries } from "@/lib/newsletter-archive-extract";

describe("extractNewsletterArchiveEntries", () => {
  it("extracts newsletter archive cards into item candidates", async () => {
    const html = `
      <html>
        <body>
          <article>
            <h2>This Week In Agents #12</h2>
            <a href="/archive/week-12">Read issue</a>
            <p>OpenAI, Cursor, and Devin all shipped updates this week.</p>
          </article>
        </body>
      </html>
    `;

    const entries = await extractNewsletterArchiveEntries(
      html,
      "https://example.com/archive",
    );

    expect(entries[0]).toMatchObject({
      title: "This Week In Agents #12",
      canonicalUrl: "https://example.com/archive/week-12",
      summary: "OpenAI, Cursor, and Devin all shipped updates this week.",
    });
  });
});
