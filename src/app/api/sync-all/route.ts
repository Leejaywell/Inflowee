import { NextResponse } from "next/server";

import { syncAllSources } from "@/lib/source-ingestion";
import { defaultStore } from "@/lib/store";

/**
 * POST /api/sync-all
 *
 * Syncs all non-error sources sequentially.
 * Designed to be called by external cron services (Vercel Cron, system crontab, etc.).
 *
 * Optional: Set SYNC_API_SECRET env var to require Bearer token authentication.
 *
 * Example cron usage:
 *   curl -X POST http://localhost:3000/api/sync-all -H "Authorization: Bearer $SYNC_API_SECRET"
 */
export async function POST(request: Request) {
  const secret = process.env.SYNC_API_SECRET;

  if (secret) {
    const authorization = request.headers.get("authorization");
    const token = authorization?.replace("Bearer ", "");

    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await syncAllSources(defaultStore);

  return NextResponse.json({
    synced: result.synced,
    failed: result.failed,
    skipped: result.skipped,
    timestamp: new Date().toISOString(),
  });
}
