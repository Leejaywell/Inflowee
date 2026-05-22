import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import { NextResponse } from "next/server";
import satori from "satori";

import { BriefCard } from "@/lib/brief-card";
import { defaultStore, getBriefById } from "@/lib/store";

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

let cachedFont: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (cachedFont) {
    return cachedFont;
  }

  const fontPath = join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");

  try {
    const buffer = await readFile(fontPath);
    cachedFont = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    return cachedFont;
  } catch {
    // Fallback: fetch from Google Fonts CDN
    const response = await fetch(
      "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
    );
    cachedFont = await response.arrayBuffer();
    return cachedFont;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ briefId: string }> },
) {
  const { briefId } = await context.params;
  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    return new NextResponse("Brief not found", { status: 404 });
  }

  const fontData = await loadFont();

  const svg = await satori(BriefCard({ brief }), {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    fonts: [
      {
        name: "Inter",
        data: fontData,
        weight: 400,
        style: "normal",
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: IMAGE_WIDTH,
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
