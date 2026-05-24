import { NextResponse } from "next/server";

import { requireSessionActor } from "@/lib/auth";
import {
  listMcpResources,
  runInfloweeMcpTool,
  type McpToolName,
} from "@/lib/mcp-tools";
import { defaultStore } from "@/lib/store";

export const dynamic = "force-dynamic";

function hasValidMcpAuthorization(authorizationHeader: string | null) {
  const token = process.env.INFLOWEE_MCP_TOKEN;

  if (!token) {
    return true;
  }

  return authorizationHeader === `Bearer ${token}`;
}

function actionsEnabled() {
  return process.env.INFLOWEE_MCP_ENABLE_ACTIONS === "1";
}

export async function GET(request: Request) {
  if (!hasValidMcpAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await requireSessionActor();
  const resources = await listMcpResources({
    store: defaultStore,
    actorId: actor.id,
    allowActions: actionsEnabled(),
  });

  return NextResponse.json({
    success: true,
    summary: "Inflowee MCP resources.",
    data: resources,
  });
}

export async function POST(request: Request) {
  if (!hasValidMcpAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await requireSessionActor();
  const body = (await request.json().catch(() => ({}))) as {
    tool?: unknown;
    input?: unknown;
  };

  if (typeof body.tool !== "string") {
    return NextResponse.json(
      {
        success: false,
        summary: "Missing MCP tool name.",
        error: "Request body must include a string tool field.",
      },
      { status: 400 },
    );
  }

  const result = await runInfloweeMcpTool(
    {
      store: defaultStore,
      actorId: actor.id,
      allowActions: actionsEnabled(),
    },
    body.tool as McpToolName,
    body.input && typeof body.input === "object"
      ? (body.input as Record<string, unknown>)
      : {},
  );

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
