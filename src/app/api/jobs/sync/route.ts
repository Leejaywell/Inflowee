import { NextResponse } from "next/server";

import { defaultStore } from "@/lib/store";
import { syncDueSources } from "@/lib/sync-runs";

export async function POST() {
  const result = await syncDueSources(defaultStore);
  return NextResponse.json(result);
}
