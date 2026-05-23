import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required."),
  INNGEST_EVENT_KEY: z
    .string()
    .trim()
    .min(1, "INNGEST_EVENT_KEY is required."),
  INNGEST_SIGNING_KEY: z
    .string()
    .trim()
    .min(1, "INNGEST_SIGNING_KEY is required."),
  INNGEST_BASE_URL: z
    .string()
    .trim()
    .url("INNGEST_BASE_URL must be a valid URL.")
    .optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    INNGEST_BASE_URL: process.env.INNGEST_BASE_URL,
  });

  return cachedEnv;
}
