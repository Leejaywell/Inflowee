/// <reference types="vitest/globals" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";

import { extractPageContent, extractPageDiagnostics } from "@/lib/page-extract";

const fixtureHtml = readFileSync(
  join(__dirname, "fixtures", "sample-page.html"),
  "utf-8",
);

describe("extractPageContent", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unmock("@/lib/store");
    vi.unmock("@/lib/source-sync");
  });

  it("extracts title, summary, and canonical URL from fixture HTML", () => {
    const result = extractPageContent(
      fixtureHtml,
      "https://example.com/blog/agent-framework",
    );

    expect(result.title).toBe("OpenAI Launches New Agent Framework");
    // og:description takes priority over meta description
    expect(result.summary).toBe(
      "OpenAI announced a new agent framework for building autonomous AI systems.",
    );
    expect(result.canonicalUrl).toBe(
      "https://example.com/blog/agent-framework",
    );
  });

  it("falls back to title tag and body text when no meta tags exist", () => {
    const html = `
      <html>
        <head><title>Simple Page</title></head>
        <body>
          <p>First paragraph of content here.</p>
          <p>Second paragraph with more details.</p>
        </body>
      </html>
    `;

    const result = extractPageContent(html, "https://example.com/simple");

    expect(result.title).toBe("Simple Page");
    expect(result.summary).toContain("First paragraph");
    expect(result.canonicalUrl).toBe("https://example.com/simple");
  });

  it("strips nav, script, and footer noise from body text", () => {
    const html = `
      <html>
        <head><title>Clean Page</title></head>
        <body>
          <nav>Navigation menu</nav>
          <script>console.log("noise")</script>
          <main><p>Main content here.</p></main>
          <footer>Copyright 2026</footer>
        </body>
      </html>
    `;

    const result = extractPageContent(html, "https://example.com/clean");

    expect(result.summary).toContain("Main content");
    expect(result.summary).not.toContain("Navigation");
    expect(result.summary).not.toContain("console.log");
    expect(result.summary).not.toContain("Copyright");
  });

  it("truncates long body text for summary", () => {
    const longParagraph = "A".repeat(600);
    const html = `<html><head><title>Long</title></head><body><p>${longParagraph}</p></body></html>`;

    const result = extractPageContent(html, "https://example.com/long");

    expect(result.summary!.length).toBeLessThanOrEqual(500);
    expect(result.summary).toContain("...");
  });

  it("returns extraction warnings alongside page diagnostics", () => {
    const html = `
      <html>
        <head><title>Simple Page</title></head>
        <body><p>Only body text is present.</p></body>
      </html>
    `;

    const result = extractPageDiagnostics(html, "https://example.com/simple");

    expect(result.warnings).toContain("missing meta description");
    expect(result.rawPreviewText).toContain("Only body text is present.");
  });

  it("renders the source diagnostics page", async () => {
    vi.doMock("@/lib/store", () => ({
      defaultStore: {},
      getSourceById: vi.fn().mockResolvedValue({
        id: "source-1",
        title: "Example page",
        url: "https://example.com/page",
        sourceType: "PAGE",
        status: "idle",
        lastSyncedAt: null,
        nextSyncAt: null,
        lastError: null,
      }),
      listRecentSyncRunsBySource: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/lib/source-sync", () => ({
      fetchSourceFeed: vi
        .fn()
        .mockResolvedValue("<html><head><title>Example page</title></head><body><p>Preview text.</p></body></html>"),
    }));

    const { default: MockedPage } = await import("@/app/sources/[sourceId]/page");
    const view = await MockedPage({
      params: Promise.resolve({ sourceId: "source-1" }),
    });

    render(view);

    expect(
      screen.getByRole("heading", { name: "Example page" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Extraction diagnostics")).toBeInTheDocument();
  });
});
