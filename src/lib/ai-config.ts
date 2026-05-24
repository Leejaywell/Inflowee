export type AiRuntimeStatus = {
  provider: string;
  mode: "live" | "fallback";
  configured: boolean;
  baseUrl: string;
  model: string;
};

export type AiProviderConfig = {
  provider: string;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  configured: boolean;
};

function normalizeBaseUrl(value: string | undefined) {
  const baseUrl = value?.trim() || "https://api.openai.com/v1";
  return baseUrl.replace(/\/+$/, "");
}

export function getAiProviderConfig(): AiProviderConfig {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AI_API_KEY?.trim() ||
    null;
  const baseUrl = normalizeBaseUrl(
    process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL,
  );
  const model =
    process.env.OPENAI_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    "gpt-4o-mini";

  return {
    provider:
      process.env.OPENAI_PROVIDER_NAME?.trim() ||
      process.env.AI_PROVIDER_NAME?.trim() ||
      "openai-compatible",
    apiKey,
    baseUrl,
    model,
    configured: Boolean(apiKey),
  };
}

export function getAiRuntimeStatus(): AiRuntimeStatus {
  const config = getAiProviderConfig();

  return {
    provider: config.provider,
    mode: config.configured ? "live" : "fallback",
    configured: config.configured,
    baseUrl: config.baseUrl,
    model: config.model,
  };
}
