import { XMLParser } from "fast-xml-parser";

type ParsedFeedItem = {
  title: string;
  canonicalUrl: string;
  publishedAt: string | null;
  summary: string | null;
};

type FeedEntry = {
  title?: unknown;
  link?: unknown;
  guid?: unknown;
  pubDate?: unknown;
  published?: unknown;
  description?: unknown;
  summary?: unknown;
  "content:encoded"?: unknown;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getTextValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (value && typeof value === "object") {
    const candidate = (value as Record<string, unknown>)["#text"];
    return typeof candidate === "string" && candidate.trim().length > 0
      ? candidate.trim()
      : null;
  }

  return null;
}

function getCanonicalUrl(entry: FeedEntry): string | null {
  const linkValue = entry.link;

  if (typeof linkValue === "string" && linkValue.trim().length > 0) {
    return linkValue.trim();
  }

  if (linkValue && typeof linkValue === "object") {
    const href = (linkValue as Record<string, unknown>)["@_href"];
    if (typeof href === "string" && href.trim().length > 0) {
      return href.trim();
    }
  }

  return getTextValue(entry.guid);
}

function getPublishedAt(entry: FeedEntry): string | null {
  const raw = getTextValue(entry.pubDate) ?? getTextValue(entry.published);

  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getSummary(entry: FeedEntry): string | null {
  return (
    getTextValue(entry.description) ??
    getTextValue(entry.summary) ??
    getTextValue(entry["content:encoded"])
  );
}

export function parseFeedItems(xml: string): ParsedFeedItem[] {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: FeedEntry | FeedEntry[] } };
    feed?: { entry?: FeedEntry | FeedEntry[] };
  };
  const rawItems = [
    ...asArray(parsed.rss?.channel?.item),
    ...asArray(parsed.feed?.entry),
  ];

  return rawItems.flatMap((entry) => {
    const canonicalUrl = getCanonicalUrl(entry);

    if (!canonicalUrl) {
      return [];
    }

    return [
      {
        title: getTextValue(entry.title) ?? canonicalUrl,
        canonicalUrl,
        publishedAt: getPublishedAt(entry),
        summary: getSummary(entry),
      },
    ];
  });
}
