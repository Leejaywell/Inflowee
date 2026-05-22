import { NextResponse } from "next/server";

import { enqueueScheduledSync } from "@/lib/inngest";

export async function POST() {
  // Keep the operator trigger enqueue-only; the worker performs the sync.
  const now = new Date().toISOString();
  const { ids } = await enqueueScheduledSync({ now });

  return NextResponse.json({
    queued: true,
    eventIds: ids,
    now,
  });
}
