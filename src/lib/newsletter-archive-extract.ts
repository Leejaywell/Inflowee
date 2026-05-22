import { extractStructuredList } from "@/lib/structured-extract";

export async function extractNewsletterArchiveEntries(
  html: string,
  baseUrl: string,
) {
  return extractStructuredList(html, baseUrl);
}
