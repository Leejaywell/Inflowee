/// <reference types="vitest/globals" />

import { buildDeliveryPayload, deliverBriefWithRetry } from "@/lib/delivery";
import { makeBriefRecord } from "./helpers/records";

describe("delivery payloads", () => {
  it("builds channel-specific payloads from a personal brief", async () => {
    const brief = makeBriefRecord({
      title: "Agent launch",
      summary: "A new coding agent launched.",
    });

    await expect(
      buildDeliveryPayload({ channel: "webhook", brief }),
    ).resolves.toEqual(
      expect.objectContaining({
        briefId: "brief-1",
        format: "html",
        title: "Agent launch",
      }),
    );
    await expect(
      buildDeliveryPayload({ channel: "telegram", brief, chatId: "123" }),
    ).resolves.toEqual(
      expect.objectContaining({
        chat_id: "123",
        parse_mode: "HTML",
      }),
    );
  });

  it("retries transient delivery failures", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const result = await deliverBriefWithRetry({
      endpoint: "https://example.com/webhook",
      payload: {
        briefId: "brief-1",
        format: "html",
        title: "Agent launch",
        html: "<p>Agent launch</p>",
      },
      fetchImpl,
      maxAttempts: 2,
      sleepImpl,
    });

    expect(result).toEqual({
      attempts: 2,
      status: "success",
      responseStatus: 200,
    });
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });
});
