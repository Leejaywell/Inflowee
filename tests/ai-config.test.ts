/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";

describe("AI provider config", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("defaults to OpenAI-compatible settings without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");
    vi.stubEnv("OPENAI_MODEL", "");

    const { getAiProviderConfig } = await import("@/lib/ai-config");

    expect(getAiProviderConfig()).toMatchObject({
      configured: false,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    });
  });

  it("reads OpenAI-compatible provider overrides", async () => {
    vi.stubEnv("OPENAI_PROVIDER_NAME", "DeepSeek");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_BASE_URL", "https://api.deepseek.com/v1/");
    vi.stubEnv("OPENAI_MODEL", "deepseek-chat");

    const { getAiProviderConfig } = await import("@/lib/ai-config");

    expect(getAiProviderConfig()).toMatchObject({
      provider: "DeepSeek",
      apiKey: "sk-test",
      configured: true,
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    });
  });
});
