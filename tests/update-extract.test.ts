/// <reference types="vitest/globals" />

import { extractUpdateEntries } from "@/lib/update-extract";

describe("extractUpdateEntries", () => {
  it("extracts update entries from a changelog page", () => {
    const html = `
      <html>
        <head><title>Changelog</title></head>
        <body>
          <section>
            <h2>Added topic intelligence refresh</h2>
            <a href="#2026-05-22">Permalink</a>
            <time datetime="2026-05-22T00:00:00.000Z"></time>
            <p>Topic recommendations can now be refreshed on demand.</p>
          </section>
        </body>
      </html>
    `;

    const entries = extractUpdateEntries(html, "https://example.com/changelog");

    expect(entries[0]).toMatchObject({
      title: "Added topic intelligence refresh",
      canonicalUrl: "https://example.com/changelog#2026-05-22",
      summary: "Topic recommendations can now be refreshed on demand.",
      publishedAt: "2026-05-22T00:00:00.000Z",
    });
  });
});
