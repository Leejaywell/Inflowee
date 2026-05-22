import { NextResponse } from "next/server";

import { renderBriefHtmlDigest } from "@/lib/brief-render";
import { defaultStore, getBriefById, listItemsByBriefId } from "@/lib/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ briefId: string }> },
) {
  const { briefId } = await context.params;
  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    return new NextResponse("Brief not found", { status: 404 });
  }

  const linkedItems = await listItemsByBriefId(defaultStore, briefId);
  const html = renderBriefHtmlDigest({ brief, linkedItems });

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
