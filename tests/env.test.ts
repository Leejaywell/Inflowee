/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";

import { envSchema } from "@/lib/env";
import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";

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

  it("creates an isolated postgres runtime fixture", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@127.0.0.1:5432/inflowee";

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

      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
