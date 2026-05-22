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

    vi.doMock("@/lib/store", () => ({
      defaultStore,
    }));
    vi.doMock("@/lib/sync-runs", () => ({
      syncDueSources: syncDueSourcesMock,
    }));

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
  });
});
