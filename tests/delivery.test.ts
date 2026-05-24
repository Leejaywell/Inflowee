/// <reference types="vitest/globals" />

import {
  buildDeliveryPayload,
  deliverBriefWithRetry,
  listConfiguredDeliveryChannels,
  splitDeliveryText,
} from "@/lib/delivery";
import { saveNtfySettings } from "@/lib/store";
import { makeBriefRecord } from "./helpers/records";
import { createSqliteFixture } from "./helpers/sqlite-store";

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
    await expect(buildDeliveryPayload({ channel: "ntfy", brief })).resolves.toEqual(
      expect.objectContaining({
        title: "Agent launch",
        message: "A new coding agent launched.",
      }),
    );
  });

  it("exposes configured channel adapters without leaking credentials", async () => {
    const fixture = createSqliteFixture();

    try {
      await saveNtfySettings(fixture.store, "https://ntfy.sh/inflowee");

      const channels = await listConfiguredDeliveryChannels(fixture.store);

      expect(channels).toContainEqual(
        expect.objectContaining({
          type: "ntfy",
          enabled: true,
          formatGuide: expect.objectContaining({
            maxPayloadCharacters: 4000,
          }),
        }),
      );
      expect(JSON.stringify(channels)).not.toContain("https://ntfy.sh/inflowee");
    } finally {
      fixture.cleanup();
    }
  });

  it("splits long delivery text on batch limits", () => {
    expect(splitDeliveryText("first line\nsecond line\nthird line", 20)).toEqual([
      "first line",
      "second line",
      "third line",
    ]);
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
