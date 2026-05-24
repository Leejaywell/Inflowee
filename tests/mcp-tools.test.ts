/// <reference types="vitest/globals" />

import {
  listMcpResources,
  runInfloweeMcpTool,
} from "@/lib/mcp-tools";
import {
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createTaskRecord,
} from "@/lib/store";
import { createSqliteFixture } from "./helpers/sqlite-store";

async function seedMcpFixture() {
  const fixture = createSqliteFixture();
  const taskId = await createTaskRecord(fixture.store, {
    ownerId: "user-1",
    title: "Track agents",
    taskType: "TOPIC",
    userPrompt: "Track AI coding agents.",
  });
  await createTaskRecord(fixture.store, {
    ownerId: "user-2",
    title: "Other task",
    taskType: "TOPIC",
    userPrompt: "Track unrelated updates.",
  });
  const sourceId = await createSourceRecord(fixture.store, {
    taskId,
    sourceType: "RSS",
    title: "Agent feed",
    url: "https://example.com/feed.xml",
  });
  const item = await createItemRecordResult(fixture.store, {
    sourceId,
    title: "Coding agent launch",
    canonicalUrl: "https://example.com/agent",
    summary: "A new AI coding agent launched.",
    qualityStatus: "accepted",
    relevanceScore: 0.9,
  });
  const briefId = await createBriefRecord(fixture.store, {
    taskId,
    itemIds: item ? [item.id] : [],
    title: "Agent launch",
    summary: "A new AI coding agent launched.",
    whyItMatters: "Developer tooling is changing.",
    sourceCitations: ["https://example.com/agent"],
  });

  return {
    fixture,
    taskId,
    itemId: item?.id,
    briefId,
  };
}

describe("MCP tool layer", () => {
  it("lists actor-scoped tasks and reads briefs", async () => {
    const { fixture, briefId } = await seedMcpFixture();

    try {
      const context = {
        store: fixture.store,
        actorId: "user-1",
      };

      await expect(runInfloweeMcpTool(context, "list_tasks")).resolves.toEqual(
        expect.objectContaining({
          success: true,
          data: [expect.objectContaining({ title: "Track agents" })],
        }),
      );
      await expect(
        runInfloweeMcpTool(context, "read_brief", { briefId }),
      ).resolves.toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            title: "Agent launch",
            sourceCitations: ["https://example.com/agent"],
          }),
        }),
      );
      await expect(
        runInfloweeMcpTool(
          { store: fixture.store, actorId: "user-2" },
          "read_brief",
          { briefId },
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          success: false,
          error: "Brief not found for the current actor.",
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("searches actor-scoped items with citations", async () => {
    const { fixture } = await seedMcpFixture();

    try {
      const result = await runInfloweeMcpTool(
        { store: fixture.store, actorId: "user-1" },
        "search_items",
        { query: "coding", limit: 5 },
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: [
            expect.objectContaining({
              title: "Coding agent launch",
              citation: "https://example.com/agent",
            }),
          ],
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects action tools unless explicitly enabled", async () => {
    const { fixture, taskId } = await seedMcpFixture();

    try {
      await expect(
        runInfloweeMcpTool(
          { store: fixture.store, actorId: "user-1" },
          "generate_report",
          { taskId, mode: "current" },
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          success: false,
          error: "MCP write/action tools require explicit server configuration.",
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("generates reports when actions are enabled and blocks unconfigured delivery", async () => {
    const { fixture, taskId } = await seedMcpFixture();

    try {
      const context = {
        store: fixture.store,
        actorId: "user-1",
        allowActions: true,
      };
      const reportResult = await runInfloweeMcpTool(
        context,
        "generate_report",
        { taskId, mode: "current" },
      );

      expect(reportResult.success).toBe(true);
      const reportId = (reportResult.data as { id: string }).id;

      await expect(
        runInfloweeMcpTool(context, "send_report", {
          reportId,
          channel: "ntfy",
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          success: false,
          error: "send_report can only use already configured delivery channels.",
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("exposes sanitized MCP resources", async () => {
    const { fixture } = await seedMcpFixture();

    try {
      const resources = await listMcpResources({
        store: fixture.store,
        actorId: "user-1",
      });

      expect(resources.tasks).toHaveLength(1);
      expect(resources.briefs).toHaveLength(1);
      expect(resources.deliveryChannels).toContainEqual(
        expect.objectContaining({
          type: "webhook",
          enabled: false,
        }),
      );
    } finally {
      fixture.cleanup();
    }
  });
});
