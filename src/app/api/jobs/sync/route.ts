import { NextResponse } from "next/server";

import { hasValidCronAuthorizationHeader } from "@/lib/cron-auth";
import { enqueueScheduledSync } from "@/lib/inngest";

export async function POST(request: Request) {
  if (!hasValidCronAuthorizationHeader(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Keep the operator trigger enqueue-only; the worker performs the sync.
  const now = new Date().toISOString();
  const { ids } = await enqueueScheduledSync({ now });

  return NextResponse.json({
    queued: true,
    eventIds: ids,
    now,
  });
}
