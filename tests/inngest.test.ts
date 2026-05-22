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

  it("queues automatic delivery for a newly created brief", async () => {
    const sendMock = vi.fn().mockResolvedValue({ ids: ["evt_1"] });
    const previousEventKey = process.env.INNGEST_EVENT_KEY;
    const previousBaseUrl = process.env.INNGEST_BASE_URL;
    process.env.INNGEST_EVENT_KEY = "evt_test_local";
    process.env.INNGEST_BASE_URL = "http://127.0.0.1:8288";

    try {
      const { inngest, queueBriefDelivery, BRIEF_DELIVERY_EVENT } = await import(
        "@/lib/inngest"
      );
      vi.spyOn(inngest, "send").mockImplementation(sendMock);

      await queueBriefDelivery("brief-1");
      await queueBriefDelivery("brief-1", { requestKey: "brief-1:same-key" });

      expect(sendMock).toHaveBeenCalledWith({
        name: BRIEF_DELIVERY_EVENT,
        data: { briefId: "brief-1" },
      });
      expect(sendMock).toHaveBeenCalledWith({
        id: "brief-delivery:brief-1:brief-1:same-key",
        name: BRIEF_DELIVERY_EVENT,
        data: { briefId: "brief-1", requestKey: "brief-1:same-key" },
      });
    } finally {
      if (previousEventKey === undefined) {
        delete process.env.INNGEST_EVENT_KEY;
      } else {
        process.env.INNGEST_EVENT_KEY = previousEventKey;
      }
      if (previousBaseUrl === undefined) {
        delete process.env.INNGEST_BASE_URL;
      } else {
        process.env.INNGEST_BASE_URL = previousBaseUrl;
      }
    }
  });

  it("delivers a brief through the inngest delivery worker", async () => {
    const deliverStoredBriefMock = vi.fn().mockResolvedValue({
      status: "success",
      responseStatus: 202,
    });
    const getDefaultRuntimeStoreMock = vi.fn().mockReturnValue({ prisma: {} });
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@127.0.0.1:5432/inflowee";

    vi.doMock("@/lib/store", () => ({
      defaultStore: { database: {} },
      getDefaultRuntimeStore: getDefaultRuntimeStoreMock,
    }));
    vi.doMock("@/lib/delivery", () => ({
      deliverStoredBrief: deliverStoredBriefMock,
    }));

    try {
      const { runBriefDeliveryEvent } = await import("@/lib/inngest");
      await runBriefDeliveryEvent({ briefId: "brief-1" });

      expect(getDefaultRuntimeStoreMock).toHaveBeenCalledTimes(1);
      expect(deliverStoredBriefMock).toHaveBeenCalledWith(
        { prisma: {} },
        "brief-1",
        { maxAttempts: 2 },
      );
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  it("deduplicates in-flight duplicate delivery events for the same brief", async () => {
    const deliverStoredBriefMock = vi.fn().mockResolvedValue({
      status: "success",
      responseStatus: 202,
    });
    const deliveryLogs: string[] = [];

    vi.doMock("@/lib/store", () => ({
      defaultStore: { database: {} },
      getDefaultRuntimeStore: vi.fn(() => ({ database: {} })),
    }));
    vi.doMock("@/lib/delivery", () => ({
      deliverStoredBrief: vi.fn(async (...args: unknown[]) => {
        deliveryLogs.push(args[1] as string);
        return deliverStoredBriefMock(...args);
      }),
    }));

    try {
      const { handleBriefDeliveryRequested } = await import("@/lib/inngest");
      const listDeliveryLogsByBriefId = async (briefId: string) =>
        deliveryLogs.filter((candidateBriefId) => candidateBriefId === briefId);

      await Promise.all([
        handleBriefDeliveryRequested({ briefId: "brief-1", requestKey: "same-key" }),
        handleBriefDeliveryRequested({ briefId: "brief-1", requestKey: "same-key" }),
      ]);

      expect(deliverStoredBriefMock).toHaveBeenCalledTimes(1);
      expect(await listDeliveryLogsByBriefId("brief-1")).toHaveLength(1);
    } finally {
      vi.resetModules();
    }
  });

  it("only collapses duplicate delivery events while the first run is in flight", async () => {
    const deliverStoredBriefMock = vi.fn();
    let resolveFirstRun: ((value: { status: "success"; responseStatus: number }) => void) | null =
      null;

    deliverStoredBriefMock
      .mockImplementationOnce(
        () =>
          new Promise<{ status: "success"; responseStatus: number }>((resolve) => {
            resolveFirstRun = resolve;
          }),
      )
      .mockResolvedValue({
        status: "success",
        responseStatus: 202,
      });

    vi.doMock("@/lib/store", () => ({
      defaultStore: { database: {} },
      getDefaultRuntimeStore: vi.fn(() => ({ database: {} })),
    }));
    vi.doMock("@/lib/delivery", () => ({
      deliverStoredBrief: deliverStoredBriefMock,
    }));

    try {
      const { handleBriefDeliveryRequested } = await import("@/lib/inngest");

      const firstRun = handleBriefDeliveryRequested({
        briefId: "brief-1",
        requestKey: "same-key",
      });
      const secondRun = handleBriefDeliveryRequested({
        briefId: "brief-1",
        requestKey: "same-key",
      });

      expect(firstRun).toBe(secondRun);
      expect(deliverStoredBriefMock).toHaveBeenCalledTimes(1);

      resolveFirstRun?.({ status: "success", responseStatus: 202 });
      await firstRun;

      await handleBriefDeliveryRequested({
        briefId: "brief-1",
        requestKey: "same-key",
      });

      expect(deliverStoredBriefMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.resetModules();
    }
  });
});
