/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";

import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";
import { envSchema } from "@/lib/env";

describe("env schema", () => {
  afterEach(() => {
    vi.resetModules();
  });

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

  it.runIf(Boolean(process.env.DATABASE_URL))(
    "creates an isolated postgres runtime fixture",
    async () => {
    const fixture = await createIsolatedPostgresStore();

    try {
      expect(fixture.databaseUrl.startsWith("postgresql://")).toBe(true);
      expect(fixture.databaseUrl).toContain("schema=test_");
      expect(fixture.prisma).toBeDefined();
      expect(
        await fixture.prisma.$queryRaw<Array<{ value: number }>>`SELECT 1 as value`,
      ).toEqual([{ value: 1 }]);
    } finally {
      await fixture.cleanup();
    }
    },
    15_000,
  );

  it("requires cloud env before creating the default prisma runtime", async () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
      INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
      INNGEST_BASE_URL: process.env.INNGEST_BASE_URL,
    };

    delete process.env.DATABASE_URL;
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    delete process.env.INNGEST_BASE_URL;

    try {
      const { getDefaultRuntimeStore } = await import("@/lib/store");

      expect(() => getDefaultRuntimeStore()).toThrow("DATABASE_URL is required for cloud runtime.");
    } finally {
      if (previous.DATABASE_URL === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous.DATABASE_URL;
      }
      if (previous.INNGEST_EVENT_KEY === undefined) {
        delete process.env.INNGEST_EVENT_KEY;
      } else {
        process.env.INNGEST_EVENT_KEY = previous.INNGEST_EVENT_KEY;
      }
      if (previous.INNGEST_SIGNING_KEY === undefined) {
        delete process.env.INNGEST_SIGNING_KEY;
      } else {
        process.env.INNGEST_SIGNING_KEY = previous.INNGEST_SIGNING_KEY;
      }
      if (previous.INNGEST_BASE_URL === undefined) {
        delete process.env.INNGEST_BASE_URL;
      } else {
        process.env.INNGEST_BASE_URL = previous.INNGEST_BASE_URL;
      }
    }
  });
});
