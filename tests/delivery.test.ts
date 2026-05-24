/// <reference types="vitest/globals" />

import {
  SESSION_SECRET_ENV,
} from "@/lib/auth-config";
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
  createTopicRecord,
  listRecentDeliveryLogsByContent,
  saveDingTalkSettings,
  saveDefaultDeliveryChannels,
  saveDeliveryTemplate,
  saveHtmlPushConfig,
  saveNtfySettings,
  saveWeComSettings,
  updateTopicDeliveryChannels,
} from "@/lib/store";
import { encryptSecret } from "@/lib/secret-box";
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

  it("uses topic-level delivery channel overrides", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        topicType: "TOPIC",
        userPrompt: "Track coding agents.",
      });
      const briefId = await createBriefRecord(fixture.store, {
        topicId,
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
      await updateTopicDeliveryChannels(fixture.store, topicId, ["ntfy"]);
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

  it("uses global default delivery channels when a topic has no override", async () => {
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        topicType: "TOPIC",
        userPrompt: "Track coding agents.",
      });
      const briefId = await createBriefRecord(fixture.store, {
        topicId,
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
      await saveDefaultDeliveryChannels(fixture.store, ["wecom"]);
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
      expect(fetchImpl.mock.calls[0]?.[0]).toBe(
        "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("publishes one HTML summary and appends the same URL to every configured channel", async () => {
    const previousSecret = process.env[SESSION_SECRET_ENV];
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    const previousAiKey = process.env.AI_API_KEY;
    process.env[SESSION_SECRET_ENV] = "test-secret";
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;
    const fixture = createSqliteFixture();

    try {
      const topicId = await createTopicRecord(fixture.store, {
        ownerId: "user-1",
        title: "Track agents",
        topicType: "TOPIC",
        userPrompt: "Track coding agents.",
      });
      const briefId = await createBriefRecord(fixture.store, {
        topicId,
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
      await updateTopicDeliveryChannels(fixture.store, topicId, [
        "ntfy",
        "wecom",
      ]);
      await saveHtmlPushConfig(fixture.store, {
        ownerId: "user-1",
        enabled: true,
        stylePreset: "minimal_news",
        modulePreset: "standard_summary",
        enabledModules: ["summary", "key_content", "citations"],
        githubTokenEncrypted: encryptSecret("github-token"),
        githubRepo: "owner/repo",
        githubBranch: "main",
        githubBasePath: "inflowee/html",
        publicBaseUrl: "https://pages.example.com",
      });
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
        async (url: string | URL | Request, init?: RequestInit) => {
          const href = String(url);

          if (href.startsWith("https://api.github.com") && !init?.method) {
            return new Response("", { status: 404 });
          }

          if (href.startsWith("https://api.github.com")) {
            return new Response(
              JSON.stringify({
                content: { html_url: "https://github.com/owner/repo/blob/main/file.html" },
                commit: { sha: "commit-sha" },
              }),
              { status: 200 },
            );
          }

          return new Response("ok", { status: 200 });
        },
      );

      const result = await deliverStoredBriefToConfiguredChannels(
        fixture.store,
        briefId,
        { fetchImpl },
      );

      expect(result.status).toBe("success");
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      const deliveryBodies = fetchImpl.mock.calls
        .filter(([url]) => !String(url).startsWith("https://api.github.com"))
        .map(([, init]) => String(init?.body));

      expect(deliveryBodies).toHaveLength(2);
      for (const body of deliveryBodies) {
        expect(body).toContain(
          "https://pages.example.com/inflowee/html/topics/track-agents/brief-" +
            `${briefId}.html`,
        );
      }
      expect(
        await listRecentDeliveryLogsByContent(
          fixture.store,
          "brief",
          briefId,
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ htmlStatus: "published" }),
          expect.objectContaining({ htmlStatus: "published" }),
        ]),
      );
    } finally {
      fixture.cleanup();
      if (previousSecret === undefined) {
        delete process.env[SESSION_SECRET_ENV];
      } else {
        process.env[SESSION_SECRET_ENV] = previousSecret;
      }
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
      if (previousAiKey === undefined) {
        delete process.env.AI_API_KEY;
      } else {
        process.env.AI_API_KEY = previousAiKey;
      }
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

  it("applies the global delivery template to text deliveries", async () => {
    const fixture = createSqliteFixture();

    try {
      await saveNtfySettings(fixture.store, "https://ntfy.sh/inflowee");
      await saveDeliveryTemplate(
        fixture.store,
        "[{{contentType}}] {{title}}\n{{summary}}",
      );
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
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://ntfy.sh/inflowee",
        expect.objectContaining({
          body: JSON.stringify({
            title: "Weekly report",
            message: "[report] Weekly report\nReport body",
          }),
        }),
      );
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
