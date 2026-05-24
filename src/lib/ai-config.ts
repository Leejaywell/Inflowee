export type AiRuntimeStatus = {
  provider: "openai";
  mode: "live" | "fallback";
  configured: boolean;
};

export function getAiRuntimeStatus(): AiRuntimeStatus {
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());

  return {
    provider: "openai",
    mode: configured ? "live" : "fallback",
    configured,
  };
}
