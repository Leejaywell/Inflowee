/// <reference types="vitest/globals" />

import {
  buildDeliveryPayload,
  deliverBriefDigest,
  deliverBriefWithRetry,
  deliverStoredBrief,
} from "@/lib/delivery";
import { renderBriefHtmlDigest } from "@/lib/brief-render";
import {
  createBriefRecord,
  createDeliveryLog,
  createSpaceRecord,
  createTaskRecord,
  finishDeliveryLog,
  listRecentDeliveryLogsByBrief,
  type BriefRecord,
  type ItemRecord,
} from "@/lib/store";
import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";

const samplePayload = {
  briefId: "brief-1",
  format: "html" as const,
  title: "OpenAI ships a notable update",
  html: "<html><body>digest</body></html>",
};

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
  it("renders a channel-specific payload for slack delivery", async () => {
    const payload = await buildDeliveryPayload({
      channel: "slack",
      brief: {
        id: "brief-1",
        title: "Launch",
        summary: "Summary",
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("Launch"),
      }),
    );
  });

  it("posts the rendered brief payload to a webhook endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
    });

    const status = await deliverBriefDigest({
      endpoint: "https://example.com/webhook",
      payload: samplePayload,
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
        body: JSON.stringify(samplePayload),
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
        payload: samplePayload,
        fetchImpl,
      }),
    ).rejects.toThrow("Webhook delivery failed with status 500: boom");
  });

  it("retries failed webhook delivery up to the configured attempt limit", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("boom"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
      });

    const result = await deliverBriefWithRetry({
      endpoint: "https://example.com/webhook",
      payload: samplePayload,
      fetchImpl,
      maxAttempts: 2,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      status: "success",
      responseStatus: 202,
      attempts: 2,
    });
  });

  it("records the final failed attempt after max retries", async () => {
    const result = await deliverBriefWithRetry({
      endpoint: "https://example.com/hook",
      payload: samplePayload,
      fetchImpl: vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
      maxAttempts: 3,
    });

    expect(result.status).toBe("error");
    expect(result.attempts).toBe(3);
  });

  it("backs off between failed delivery attempts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(new Response("still nope", { status: 502 }))
      .mockResolvedValueOnce(new Response("ok", { status: 202 }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const result = await deliverBriefWithRetry({
      endpoint: "https://example.com/hook",
      payload: samplePayload,
      fetchImpl,
      sleepImpl,
      maxAttempts: 3,
    });

    expect(result).toEqual({
      status: "success",
      responseStatus: 202,
      attempts: 3,
    });
    expect(sleepImpl).toHaveBeenNthCalledWith(1, 250);
    expect(sleepImpl).toHaveBeenNthCalledWith(2, 500);
  });

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "persists delivery logs through the postgres-backed store",
    async () => {
    const fixture = await createIsolatedPostgresStore();

    try {
      const spaceId = await createSpaceRecord(fixture.store, {
        name: "AI Watch",
    },
  );
      const taskId = await createTaskRecord(fixture.store, {
        spaceId,
        title: "Track OpenAI updates",
        taskType: "TOPIC",
        userPrompt: "Track OpenAI updates",
      });
      const briefId = await createBriefRecord(fixture.store, {
        taskId,
        itemIds: [],
        title: "OpenAI ships a notable update",
        summary: "The API changelog added a production-facing update.",
        whyItMatters:
          "The change affects teams that rely on the latest API behavior.",
        sourceCitations: ["https://openai.com/changelog"],
      });

      const logId = await createDeliveryLog(fixture.store, {
        briefId,
        endpoint: "https://example.com/webhook",
        payloadType: "html",
      });

      await finishDeliveryLog(fixture.store, {
        logId,
        status: "success",
        responseStatus: 202,
      });

      expect(await listRecentDeliveryLogsByBrief(fixture.store, briefId)).toEqual([
        expect.objectContaining({
          id: logId,
          briefId,
          status: "success",
          attemptCount: null,
          responseStatus: 202,
        }),
      ]);
    } finally {
      await fixture.cleanup();
    }
    },
    15_000,
  );

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "delivers a stored brief through the shared retry pipeline",
    async () => {
      const fixture = await createIsolatedPostgresStore();

      try {
        const spaceId = await createSpaceRecord(fixture.store, {
          name: "AI Watch",
        });
        const taskId = await createTaskRecord(fixture.store, {
          spaceId,
          title: "Track OpenAI updates",
          taskType: "TOPIC",
          userPrompt: "Track OpenAI updates",
        });
        const briefId = await createBriefRecord(fixture.store, {
          taskId,
          itemIds: [],
          title: "OpenAI ships a notable update",
          summary: "The API changelog added a production-facing update.",
          whyItMatters:
            "The change affects teams that rely on the latest API behavior.",
          sourceCitations: ["https://openai.com/changelog"],
        });

        await fixture.store.prisma!.appSetting.upsert({
          where: { key: "webhook_endpoint" },
          update: {
            value: "https://example.com/webhook",
            updatedAt: new Date(),
          },
          create: {
            key: "webhook_endpoint",
            value: "https://example.com/webhook",
            updatedAt: new Date(),
          },
        });

        const fetchImpl = vi.fn().mockResolvedValue({
          ok: true,
          status: 202,
        });

        const result = await deliverStoredBrief(fixture.store, briefId, {
          fetchImpl,
          maxAttempts: 2,
        });

        expect(result.status).toBe("success");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(await listRecentDeliveryLogsByBrief(fixture.store, briefId)).toEqual([
          expect.objectContaining({
            briefId,
            status: "success",
            attemptCount: 1,
            responseStatus: 202,
          }),
        ]);
      } finally {
        await fixture.cleanup();
      }
    },
    15_000,
  );

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "persists the failed attempt count in the delivery log error",
    async () => {
      const fixture = await createIsolatedPostgresStore();

      try {
        const spaceId = await createSpaceRecord(fixture.store, {
          name: "AI Watch",
        });
        const taskId = await createTaskRecord(fixture.store, {
          spaceId,
          title: "Track OpenAI updates",
          taskType: "TOPIC",
          userPrompt: "Track OpenAI updates",
        });
        const briefId = await createBriefRecord(fixture.store, {
          taskId,
          itemIds: [],
          title: "OpenAI ships a notable update",
          summary: "The API changelog added a production-facing update.",
          whyItMatters:
            "The change affects teams that rely on the latest API behavior.",
          sourceCitations: ["https://openai.com/changelog"],
        });

        await fixture.store.prisma!.appSetting.upsert({
          where: { key: "webhook_endpoint" },
          update: {
            value: "https://example.com/webhook",
            updatedAt: new Date(),
          },
          create: {
            key: "webhook_endpoint",
            value: "https://example.com/webhook",
            updatedAt: new Date(),
          },
        });

        const result = await deliverStoredBrief(fixture.store, briefId, {
          fetchImpl: vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
          sleepImpl: vi.fn().mockResolvedValue(undefined),
          maxAttempts: 3,
        });

        expect(result).toMatchObject({
          status: "error",
          attempts: 3,
        });
        expect(await listRecentDeliveryLogsByBrief(fixture.store, briefId)).toEqual([
          expect.objectContaining({
            briefId,
            status: "error",
            attemptCount: 3,
            error: "Webhook delivery failed with status 500: nope",
          }),
        ]);
      } finally {
        await fixture.cleanup();
      }
    },
    15_000,
  );
});
