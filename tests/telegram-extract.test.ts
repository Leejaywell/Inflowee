import { describe, expect, it } from "vitest";

import {
  extractTelegramPublicDiagnostics,
  extractTelegramPublicFeed,
} from "@/lib/telegram-extract";

describe("telegram public extract", () => {
  const html = `
    <section class="tgme_channel_history">
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message_text">
          Hiring update: two new AI infra roles opened this week for remote teams.
        </div>
        <a class="tgme_widget_message_date" href="https://t.me/s/examplechannel/42">
          <time datetime="2026-05-22T08:00:00+00:00"></time>
        </a>
      </div>
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message_text">
          Community note: product engineers wanted for Telegram bot tooling.
        </div>
        <a class="tgme_widget_message_date" href="https://t.me/s/examplechannel/43">
          <time datetime="2026-05-22T09:00:00+00:00"></time>
        </a>
      </div>
    </section>
  `;

  it("extracts recent telegram messages as feed items", () => {
    expect(
      extractTelegramPublicFeed(html, "https://t.me/s/examplechannel"),
    ).toEqual([
      expect.objectContaining({
        title: expect.stringContaining("Hiring update"),
        canonicalUrl: "https://t.me/s/examplechannel/42",
        publishedAt: "2026-05-22T08:00:00+00:00",
      }),
      expect.objectContaining({
        title: expect.stringContaining("Community note"),
        canonicalUrl: "https://t.me/s/examplechannel/43",
        publishedAt: "2026-05-22T09:00:00+00:00",
      }),
    ]);
  });

  it("returns diagnostics for extracted telegram messages", () => {
    const diagnostics = extractTelegramPublicDiagnostics(
      html,
      "https://t.me/s/examplechannel",
    );

    expect(diagnostics.items).toHaveLength(2);
    expect(diagnostics.warnings).toEqual([]);
    expect(diagnostics.rawPreviewHtml).toContain("tgme_widget_message_wrap");
  });
});
