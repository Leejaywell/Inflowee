/// <reference types="vitest/globals" />

import {
  buildDeliveryPayload,
  deliverBriefWithRetry,
  deliverStoredBriefToConfiguredChannels,
  deliverTextToChannel,
  listConfiguredDeliveryChannels,
  splitDeliveryText,
} from "@/lib/delivery";
import {
  createBriefRecord,
  createTaskRecord,
  listRecentDeliveryLogsByContent,
  saveDingTalkSettings,
  saveNtfySettings,
  saveWeComSettings,
  updateTaskDeliveryChannels,
} from "@/lib/store";
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
    await expect(
      buildDeliveryPayload({ channel: "dingtalk", brief }),
    ).resolves.toEqual(
      expect.objectContaining({
        msgtype: "text",
        text: expect.objectContaining({
          content: expect.stringContaining("Agent launch"),
        }),
      }),
    );
    await expect(buildDeliveryPayload({ channel: "bark", brief })).resolves.toEqual(
      expect.objectContaining({
        title: "Agent launch",
        body: "A new coding agent launched.",
      }),
    );
    await expect(buildDeliveryPayload({ channel: "email", brief })).resolves.toEqual(
      expect.objectContaining({
        subject: "Agent launch",
        text: "A new coding agent launched.",
      }),
    );
  });

  it("exposes configured channel adapters without leaking credentials", async () => {
    const fixture = createSqliteFixture();

    try {
      await saveNtfySettings(fixture.store, "https://ntfy.sh/inflowee");
      await saveDingTalkSettings(
        fixture.store,
        "https://oapi.dingtalk.com/robot/send?access_token=test",
      );

      const channels = await listConfiguredDeliveryChannels(fixture.store);

      expect(channels).toContainEqual(
        expect.objectContaining({
          type: "ntfy",
          enabled: true,
          updatedAt: expect.any(String),
          formatGuide: expect.objectContaining({
            maxPayloadCharacters: 4000,
          }),
        }),
      );
      expect(JSON.stringify(channels)).not.toContain("https://ntfy.sh/inflowee");
      expect(JSON.stringify(channels)).not.toContain("access_token=test");
    } finally {
      fixture.cleanup();
    }
  });

  it("uses task-level delivery channel overrides", async () => {
    const fixture = createSqliteFixture();

    try {
      const taskId = await createTaskRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        taskType: "TOPIC",
        userPrompt: "Track coding agents.",
      });
      const briefId = await createBriefRecord(fixture.store, {
        taskId,
        itemIds: [],
        title: "Agent launch",
        summary: "A new coding agent launched.",
        whyItMatters: "Developer tooling is changing.",
        sourceCitations: ["https://example.com/agent"],
      });
      await saveNtfySettings(fixture.store, "https://ntfy.sh/inflowee");
      await saveWeComSettings(
        fixture.store,
        "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test",
      );
      await updateTaskDeliveryChannels(fixture.store, taskId, ["ntfy"]);
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("ok", { status: 200 }),
      );

      const result = await deliverStoredBriefToConfiguredChannels(
        fixture.store,
        briefId,
        { fetchImpl },
      );

      expect(result.status).toBe("success");
      expect(result.deliveries).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://ntfy.sh/inflowee");
    } finally {
      fixture.cleanup();
    }
  });

  it("logs report delivery independently from brief delivery", async () => {
    const fixture = createSqliteFixture();

    try {
      await saveNtfySettings(fixture.store, "https://ntfy.sh/inflowee");
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("ok", { status: 200 }),
      );

      const result = await deliverTextToChannel(
        fixture.store,
        "ntfy",
        {
          id: "report-1",
          title: "Weekly report",
          body: "Report body",
          contentType: "report",
        },
        { fetchImpl },
      );

      expect(result.status).toBe("success");
      expect(
        await listRecentDeliveryLogsByContent(
          fixture.store,
          "report",
          "report-1",
        ),
      ).toEqual([
        expect.objectContaining({
          contentType: "report",
          contentId: "report-1",
          payloadType: "ntfy",
          status: "success",
        }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it("requires direct SMTP email endpoints to include sender and recipient", async () => {
    await expect(
      deliverBriefWithRetry({
        endpoint: "smtps://user:pass@smtp.example.com:465",
        payload: {
          subject: "Agent launch",
          text: "A new coding agent launched.",
        },
        maxAttempts: 1,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "error",
        error: "Email SMTP endpoint must include from and to query parameters.",
      }),
    );
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
