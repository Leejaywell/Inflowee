/// <reference types="vitest/globals" />

import { deliverBriefDigest } from "@/lib/delivery";
import { renderBriefHtmlDigest } from "@/lib/brief-render";
import type { BriefRecord, ItemRecord } from "@/lib/store";

describe("brief HTML rendering", () => {
  const brief: BriefRecord = {
    id: "brief-1",
    taskId: "task-1",
    title: "OpenAI ships a notable update",
    summary: "The API changelog added a production-facing update.",
    whyItMatters: "The change affects teams that rely on the latest API behavior.",
    sourceCitations: ["https://openai.com/changelog"],
    relevanceScore: 0.88,
    importanceScore: 0.9,
    tags: ["openai", "changelog"],
    isRead: false,
    createdAt: "2026-05-22T10:00:00.000Z",
    taskTitle: "Track OpenAI updates",
    spaceName: "AI Watch",
  };

  const linkedItems: ItemRecord[] = [
    {
      id: "item-1",
      sourceId: "source-1",
      title: "OpenAI changelog",
      canonicalUrl: "https://openai.com/changelog",
      summary: "API update details.",
      rawContent: "API update details.",
      origin: "openai.com",
      language: "en",
      contentHash: "hash-1",
      structuredFields: null,
      publishedAt: "2026-05-22T09:00:00.000Z",
      fetchedAt: "2026-05-22T09:05:00.000Z",
      createdAt: "2026-05-22T09:05:00.000Z",
    },
  ];

  it("renders a canonical HTML digest for a brief", () => {
    const html = renderBriefHtmlDigest({ brief, linkedItems });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("OpenAI ships a notable update");
    expect(html).toContain("Important");
    expect(html).toContain("Relevance 88%");
    expect(html).toContain("AI Watch / Track OpenAI updates");
    expect(html).toContain("https://openai.com/changelog");
  });
});

describe("webhook delivery transport", () => {
  it("posts the rendered brief payload to a webhook endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
    });

    const status = await deliverBriefDigest({
      endpoint: "https://example.com/webhook",
      payload: {
        briefId: "brief-1",
        format: "html",
        title: "OpenAI ships a notable update",
        html: "<html><body>digest</body></html>",
      },
      fetchImpl,
    });

    expect(status).toBe(202);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          briefId: "brief-1",
          format: "html",
          title: "OpenAI ships a notable update",
          html: "<html><body>digest</body></html>",
        }),
      }),
    );
  });

  it("throws when the webhook responds with a non-ok status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("boom"),
    });

    await expect(
      deliverBriefDigest({
        endpoint: "https://example.com/webhook",
        payload: {
          briefId: "brief-1",
          format: "html",
          title: "OpenAI ships a notable update",
          html: "<html><body>digest</body></html>",
        },
        fetchImpl,
      }),
    ).rejects.toThrow("Webhook delivery failed with status 500: boom");
  });
});
