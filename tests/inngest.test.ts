/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";

describe("runScheduledSyncEvent", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("@/lib/store");
    vi.unmock("@/lib/sync-runs");
  });

  it("delegates to syncDueSources with the default store and explicit now", async () => {
    const syncDueSourcesMock = vi.fn().mockResolvedValue({
      synced: 1,
      failed: 0,
      skipped: 0,
      results: [],
    });
    const defaultStore = { database: {} };
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    vi.doMock("@/lib/store", () => ({
      createStore: vi.fn(),
      defaultStore,
    }));
    vi.doMock("@/lib/sync-runs", () => ({
      syncDueSources: syncDueSourcesMock,
    }));

    try {
      const { runScheduledSyncEvent } = await import("@/lib/inngest");
      const result = await runScheduledSyncEvent({
        now: "2026-05-22T09:00:00.000Z",
      });

      expect(syncDueSourcesMock).toHaveBeenCalledWith(defaultStore, {
        now: "2026-05-22T09:00:00.000Z",
      });
      expect(result).toEqual({
        synced: 1,
        failed: 0,
        skipped: 0,
        results: [],
      });
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  it("creates a prisma-backed runtime store when DATABASE_URL is present", async () => {
    const syncDueSourcesMock = vi.fn().mockResolvedValue({
      synced: 1,
      failed: 0,
      skipped: 0,
      results: [],
    });
    const getDefaultRuntimeStoreMock = vi.fn().mockReturnValue({ prisma: {} });
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@127.0.0.1:5432/inflowee";

    vi.doMock("@/lib/store", () => ({
      getDefaultRuntimeStore: getDefaultRuntimeStoreMock,
      defaultStore: { database: {} },
    }));
    vi.doMock("@/lib/sync-runs", () => ({
      syncDueSources: syncDueSourcesMock,
    }));

    try {
      const { runScheduledSyncEvent } = await import("@/lib/inngest");
      await runScheduledSyncEvent({
        now: "2026-05-22T09:00:00.000Z",
      });

      expect(getDefaultRuntimeStoreMock).toHaveBeenCalledTimes(1);
      expect(syncDueSourcesMock).toHaveBeenCalledWith(
        { prisma: {} },
        { now: "2026-05-22T09:00:00.000Z" },
      );
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  it("exposes the inngest serve handler route methods", async () => {
    const route = await import("@/app/api/inngest/route");

    expect(route.GET).toBeTypeOf("function");
    expect(route.POST).toBeTypeOf("function");
    expect(route.PUT).toBeTypeOf("function");
  });
});
