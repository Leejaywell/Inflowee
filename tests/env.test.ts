/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";
import { envSchema } from "@/lib/env";

describe("env schema", () => {
  it("accepts the cloud persistence contract", () => {
    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/inflowee",
      INNGEST_EVENT_KEY: "evt_test_123",
      INNGEST_SIGNING_KEY: "sign_test_123",
      INNGEST_BASE_URL: "http://127.0.0.1:8288",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an empty DATABASE_URL", () => {
    const parsed = envSchema.safeParse({
      DATABASE_URL: "",
      INNGEST_EVENT_KEY: "evt_test_123",
      INNGEST_SIGNING_KEY: "sign_test_123",
      INNGEST_BASE_URL: "http://127.0.0.1:8288",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["DATABASE_URL"]);
  });
});
