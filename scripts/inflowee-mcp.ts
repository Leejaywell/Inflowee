#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { loadDevEnv } from "./load-dev-env.ts";
import {
  INFLOWEE_MCP_TOOLS,
  listMcpResources,
  runInfloweeMcpTool,
  type McpToolName,
} from "@/lib/mcp-tools";
import { defaultStore } from "@/lib/store";

loadDevEnv();

const actorId = process.env.INFLOWEE_MCP_ACTOR_ID ?? "local-user";
const allowActions = process.env.INFLOWEE_MCP_ENABLE_ACTIONS === "1";

const server = new McpServer({
  name: "inflowee",
  version: "0.1.0",
});

function toMcpContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value as Record<string, unknown>,
  };
}

for (const tool of INFLOWEE_MCP_TOOLS) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: {
        input: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: tool.readOnly,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ input }) =>
      toMcpContent(
        await runInfloweeMcpTool(
          {
            store: defaultStore,
            actorId,
            allowActions,
          },
          tool.name as McpToolName,
          input ?? {},
        ),
      ),
  );
}

server.registerResource(
  "inflowee-resources",
  "inflowee://resources",
  {
    title: "Inflowee resources",
    description: "Actor-scoped tasks, sources, briefs, reports, and delivery channel status.",
    mimeType: "application/json",
  },
  async (uri) => {
    const resources = await listMcpResources({
      store: defaultStore,
      actorId,
      allowActions,
    });

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(resources, null, 2),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Inflowee MCP server running on stdio for actor ${actorId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
