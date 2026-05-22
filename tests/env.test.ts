/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";

import { createIsolatedPostgresStore } from "./helpers/postgres-test-store";
import { getSessionUser } from "@/lib/auth";
import { envSchema } from "@/lib/env";

describe("env schema", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unmock("next/headers");
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

  it("allows the default prisma runtime to bootstrap with only DATABASE_URL", async () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
      INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
      INNGEST_BASE_URL: process.env.INNGEST_BASE_URL,
    };

    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@127.0.0.1:5432/inflowee";
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    delete process.env.INNGEST_BASE_URL;

    try {
      const { createStore, defaultStore } = await import("@/lib/store");

      expect(defaultStore.runtime).toBe("prisma");
      expect(createStore().runtime).toBe("prisma");
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

  it("returns a single-user default session when no auth provider is configured", async () => {
    const sessionUser = await getSessionUser();

    expect(sessionUser).toEqual({
      id: expect.any(String),
      email: expect.stringContaining("@"),
    });
  });

  it("accepts a signed per-request actor when auth secret is configured", async () => {
    const previousSecret = process.env.INFLOWEE_SESSION_SECRET;
    process.env.INFLOWEE_SESSION_SECRET = "test-secret";

    vi.doMock("next/headers", () => ({
      headers: vi.fn().mockResolvedValue({
        get(name: string) {
          if (name === "x-inflowee-actor-id") {
            return "user-2";
          }
          if (name === "x-inflowee-actor-email") {
            return "user-2@example.com";
          }
          if (name === "x-inflowee-actor-signature") {
            return "c03416043a70a8c8dc77e83f97e8bd32dddda986590234be63eecc62a9f0a1b0";
          }
          return null;
        },
      }),
    }));

    try {
      const { getSessionUser } = await import("@/lib/auth");

      await expect(getSessionUser()).resolves.toEqual({
        id: "user-2",
        email: "user-2@example.com",
      });
    } finally {
      if (previousSecret === undefined) {
        delete process.env.INFLOWEE_SESSION_SECRET;
      } else {
        process.env.INFLOWEE_SESSION_SECRET = previousSecret;
      }
    }
  });

  it("rejects an invalid signed request actor instead of trusting it", async () => {
    const previousSecret = process.env.INFLOWEE_SESSION_SECRET;
    process.env.INFLOWEE_SESSION_SECRET = "test-secret";

    vi.doMock("next/headers", () => ({
      headers: vi.fn().mockResolvedValue({
        get(name: string) {
          if (name === "x-inflowee-actor-id") {
            return "user-2";
          }
          if (name === "x-inflowee-actor-email") {
            return "user-2@example.com";
          }
          if (name === "x-inflowee-actor-signature") {
            return "invalid";
          }
          return null;
        },
      }),
    }));

    try {
      const { requireSessionActor } = await import("@/lib/auth");

      await expect(requireSessionActor()).rejects.toThrow("Unauthorized");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.INFLOWEE_SESSION_SECRET;
      } else {
        process.env.INFLOWEE_SESSION_SECRET = previousSecret;
      }
    }
  });

  it("rejects missing signed actor context when auth secret is configured", async () => {
    const previousSecret = process.env.INFLOWEE_SESSION_SECRET;
    process.env.INFLOWEE_SESSION_SECRET = "test-secret";

    vi.doMock("next/headers", () => ({
      headers: vi.fn().mockResolvedValue({
        get() {
          return null;
        },
      }),
    }));

    try {
      const { requireSessionActor } = await import("@/lib/auth");

      await expect(requireSessionActor()).rejects.toThrow("Unauthorized");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.INFLOWEE_SESSION_SECRET;
      } else {
        process.env.INFLOWEE_SESSION_SECRET = previousSecret;
      }
    }
  });
});
