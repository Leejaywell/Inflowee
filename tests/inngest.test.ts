/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from "vitest";

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
    const createStoreMock = vi.fn().mockReturnValue({ prisma: {} });
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@127.0.0.1:5432/inflowee";

    vi.doMock("@/lib/store", () => ({
      createStore: createStoreMock,
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

      expect(createStoreMock).toHaveBeenCalledWith({
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/inflowee",
      });
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
});
