import { createHash } from "node:crypto";

export type RawItemCandidate = {
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: string | null;
  rawContent?: string | null;
  structuredFields?: Record<string, unknown> | null;
};

export type EnrichedItemCandidate = RawItemCandidate & {
  rawContent: string | null;
  origin: string;
  language: string;
  contentHash: string;
  structuredFields: Record<string, unknown> | null;
  fetchedAt: string;
};

export async function enrichItemCandidate(
  input: RawItemCandidate,
): Promise<EnrichedItemCandidate> {
  const rawContent = input.rawContent ?? input.summary ?? input.title;

  return {
    ...input,
    rawContent,
    origin: new URL(input.canonicalUrl).hostname,
    language: /^[\x00-\x7F]*$/.test(rawContent ?? "") ? "en" : "unknown",
    contentHash: createHash("sha256")
      .update(`${input.canonicalUrl}\n${input.title}\n${rawContent ?? ""}`)
      .digest("hex"),
    structuredFields: input.structuredFields ?? null,
    fetchedAt: new Date().toISOString(),
  };
}
