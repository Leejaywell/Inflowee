import { NextResponse } from "next/server";

import { hasConfiguredOperatorLogin, hasConfiguredSessionAuth } from "@/lib/auth";
import { getCronSecret } from "@/lib/cron-auth";
import { getDatabaseUrl, getPrisma } from "@/lib/db";
import { createStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasDatabaseUrl = Boolean(getDatabaseUrl());
  const health = {
    ok: true,
    runtime: hasDatabaseUrl ? "prisma" : "sqlite",
    env: {
      databaseUrl: hasDatabaseUrl,
      inngestEventKey: Boolean(process.env.INNGEST_EVENT_KEY),
      inngestSigningKey: Boolean(process.env.INNGEST_SIGNING_KEY),
      inngestBaseUrlOverride: Boolean(process.env.INNGEST_BASE_URL),
      cronSecret: Boolean(getCronSecret()),
      sessionAuth: hasConfiguredSessionAuth(),
      operatorLogin: hasConfiguredOperatorLogin(),
    },
    database: {
      ok: false,
    },
  };

  if (!hasDatabaseUrl && process.env.VERCEL) {
    return NextResponse.json(
      {
        ...health,
        runtime: "prisma",
        ok: false,
        database: {
          ok: false,
          error: "DATABASE_URL is not configured.",
        },
      },
      { status: 503 },
    );
  }

  if (!hasDatabaseUrl) {
    try {
      createStore().database.prepare("SELECT 1 as value").get();

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
            error:
              error instanceof Error ? error.message : "SQLite probe failed.",
          },
        },
        { status: 503 },
      );
    }
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
