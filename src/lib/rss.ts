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
  updated?: unknown;
  description?: unknown;
  summary?: unknown;
  "content:encoded"?: unknown;
};

type FeedLink = {
  "@_href"?: unknown;
  "@_rel"?: unknown;
  "@_type"?: unknown;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,
});

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getTextValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = normalizeText(value);
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const text = normalizeText(
      value
        .map((item) => getTextValue(item))
        .filter((item): item is string => item !== null)
        .join(" "),
    );
    return text.length > 0 ? text : null;
  }

  if (value && typeof value === "object") {
    const text = normalizeText(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !key.startsWith("@_"))
        .map(([, nestedValue]) => getTextValue(nestedValue))
        .filter((item): item is string => item !== null)
        .join(" "),
    );
    return text.length > 0 ? text : null;
  }

  return null;
}

function getUsableHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return null;
  }

  return parsedUrl.href;
}

function getCanonicalUrl(entry: FeedEntry): string | null {
  const linkValue = entry.link;

  const directLink = getUsableHttpUrl(linkValue);

  if (directLink) {
    return directLink;
  }

  const linkCandidates = asArray(linkValue).flatMap((link) =>
    link && typeof link === "object" ? [link as FeedLink] : [],
  );

  const preferredLink =
    linkCandidates.find((link) => {
      const rel = link["@_rel"];
      const type = link["@_type"];

      return (
        getUsableHttpUrl(link["@_href"]) !== null &&
        rel === "alternate" &&
        typeof type === "string" &&
        type.includes("html")
      );
    }) ??
    linkCandidates.find((link) => {
      const rel = link["@_rel"];

      return (
        getUsableHttpUrl(link["@_href"]) !== null &&
        (rel === undefined || rel === "alternate")
      );
    }) ??
    linkCandidates.find((link) => {
      return getUsableHttpUrl(link["@_href"]) !== null;
    });

  if (preferredLink) {
    return getUsableHttpUrl(preferredLink["@_href"]);
  }

  const guid = getTextValue(entry.guid);

  if (!guid) {
    return null;
  }

  if (entry.guid && typeof entry.guid === "object") {
    const isPermaLink = (entry.guid as Record<string, unknown>)["@_isPermaLink"];

    if (isPermaLink === false || isPermaLink === "false") {
      return null;
    }
  }

  return getUsableHttpUrl(guid);
}

function getPublishedAt(entry: FeedEntry): string | null {
  const raw =
    getTextValue(entry.pubDate) ??
    getTextValue(entry.published) ??
    getTextValue(entry.updated);

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
