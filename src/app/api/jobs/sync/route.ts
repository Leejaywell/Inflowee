import { NextResponse } from "next/server";

import { enqueueScheduledSync } from "@/lib/inngest";

export async function POST() {
  const now = new Date().toISOString();
  const { ids } = await enqueueScheduledSync({ now });

  return NextResponse.json({
    queued: true,
    eventIds: ids,
    now,
  });
}
