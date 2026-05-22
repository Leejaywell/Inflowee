/// <reference types="vitest/globals" />

import { extractUpdateEntries } from "@/lib/update-extract";

describe("extractUpdateEntries", () => {
  it("extracts update entries from a changelog page", () => {
    const html = `
      <html>
        <head><title>Changelog</title></head>
        <body>
          <section>
            <h2>Added task intelligence refresh</h2>
            <a href="#2026-05-22">Permalink</a>
            <time datetime="2026-05-22T00:00:00.000Z"></time>
            <p>Task recommendations can now be refreshed on demand.</p>
          </section>
        </body>
      </html>
    `;

    const entries = extractUpdateEntries(html, "https://example.com/changelog");

    expect(entries[0]).toMatchObject({
      title: "Added task intelligence refresh",
      canonicalUrl: "https://example.com/changelog#2026-05-22",
      summary: "Task recommendations can now be refreshed on demand.",
      publishedAt: "2026-05-22T00:00:00.000Z",
    });
  });
});
