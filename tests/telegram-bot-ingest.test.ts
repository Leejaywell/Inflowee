import { describe, expect, it, vi } from "vitest";

import { fetchTelegramBotFeed } from "@/lib/telegram-bot-ingest";

describe("telegram bot ingest", () => {
  it("extracts updates for the configured public telegram slug", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: [
          {
            update_id: 1,
            message: {
              text: "Hiring now: product engineer for a bot platform.",
              date: 1779532800,
              chat: {
                id: -1001,
                title: "Example Jobs",
                username: "examplejobs",
              },
            },
          },
          {
            update_id: 2,
            message: {
              text: "Ignore this other channel.",
              date: 1779532810,
              chat: {
                id: -1002,
                title: "Other Channel",
                username: "otherchannel",
              },
            },
          },
        ],
      }),
    });

    await expect(
      fetchTelegramBotFeed({
        botToken: "123456:ABCDEF_bot",
        sourceUrl: "https://t.me/examplejobs",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        title: expect.stringContaining("Hiring now"),
        canonicalUrl: "https://t.me/s/examplejobs",
      }),
    ]);
  });
});
