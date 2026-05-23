import { NextResponse } from "next/server";

import { hasConfiguredOperatorLogin, hasConfiguredSessionAuth } from "@/lib/auth";
import { getCronSecret } from "@/lib/cron-auth";
import { getDatabaseUrl, getPrisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasDatabaseUrl = Boolean(getDatabaseUrl());
  const health = {
    ok: true,
    runtime: "prisma",
    env: {
      databaseUrl: hasDatabaseUrl,
      inngestEventKey: Boolean(process.env.INNGEST_EVENT_KEY),
      inngestSigningKey: Boolean(process.env.INNGEST_SIGNING_KEY),
      inngestBaseUrl: Boolean(process.env.INNGEST_BASE_URL),
      cronSecret: Boolean(getCronSecret()),
      sessionAuth: hasConfiguredSessionAuth(),
      operatorLogin: hasConfiguredOperatorLogin(),
    },
    database: {
      ok: false,
    },
  };

  if (!hasDatabaseUrl) {
    return NextResponse.json(
      {
        ...health,
        ok: false,
        database: {
          ok: false,
          error: "DATABASE_URL is not configured.",
        },
      },
      { status: 503 },
    );
  }

  try {
    await getPrisma().$queryRaw<Array<{ value: number }>>`SELECT 1 as value`;

    return NextResponse.json({
      ...health,
      database: {
        ok: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ...health,
        ok: false,
        database: {
          ok: false,
          error: error instanceof Error ? error.message : "Database probe failed.",
        },
      },
      { status: 503 },
    );
  }
}
