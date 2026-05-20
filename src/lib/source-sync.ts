import { lookup } from "node:dns/promises";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const SOURCE_SYNC_MAX_REDIRECTS = 5;
const BLOCKED_SOURCE_URL_ERROR = "Source URL targets a blocked local or private address.";

type LookupResult = {
  address: string;
  family: number;
};

type ResolvedSourceTarget = {
  address: string;
  family: number;
  url: URL;
};

type LookupFn = (
  hostname: string,
  options: {
    all: true;
    verbatim: true;
  },
) => Promise<LookupResult[]>;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function normalizeIpAddress(hostname: string): string {
  const normalizedHostname = normalizeHostname(hostname);

  if (normalizedHostname.startsWith("::ffff:")) {
    const mappedAddress = normalizedHostname.slice(7);

    if (isIP(mappedAddress) === 4) {
      return mappedAddress;
    }

    const mappedSegments = mappedAddress.split(":");

    if (
      mappedSegments.length === 2 &&
      mappedSegments.every((segment) => /^[0-9a-f]{1,4}$/i.test(segment))
    ) {
      const [highBits, lowBits] = mappedSegments.map((segment) =>
        Number.parseInt(segment, 16),
      );

      return [
        (highBits >> 8) & 0xff,
        highBits & 0xff,
        (lowBits >> 8) & 0xff,
        lowBits & 0xff,
      ].join(".");
    }
  }

  return normalizedHostname;
}

function parseSourceUrl(url: string): URL | string {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return "Source URL must use http or https.";
    }

    return parsedUrl;
  } catch {
    return "Source URL is invalid.";
  }
}

function getSyncErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "Feed request timed out.";
    }

    return error.message;
  }

  return "Unknown sync error.";
}

export function getBlockedHostError(hostname: string): string | null {
  const normalizedHostname = normalizeIpAddress(hostname);

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname === "0.0.0.0" ||
    normalizedHostname === "host.docker.internal" ||
    normalizedHostname.endsWith(".local") ||
    normalizedHostname.endsWith(".internal")
  ) {
    return BLOCKED_SOURCE_URL_ERROR;
  }

  const ipVersion = isIP(normalizedHostname);

  if (ipVersion === 4) {
    const octets = normalizedHostname.split(".").map(Number);
    const [firstOctet, secondOctet] = octets;

    if (
      firstOctet === 0 ||
      firstOctet === 10 ||
      firstOctet === 127 ||
      (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) ||
      (firstOctet === 169 && secondOctet === 254) ||
      (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
      (firstOctet === 192 && secondOctet === 168) ||
      (firstOctet === 198 && (secondOctet === 18 || secondOctet === 19))
    ) {
      return BLOCKED_SOURCE_URL_ERROR;
    }
  }

  if (
    ipVersion === 6 &&
    (normalizedHostname === "::1" ||
      normalizedHostname === "::" ||
      normalizedHostname.startsWith("fc") ||
      normalizedHostname.startsWith("fd") ||
      normalizedHostname.startsWith("fe80:"))
  ) {
    return BLOCKED_SOURCE_URL_ERROR;
  }

  return null;
}

export function getBlockedSourceUrlError(url: string): string | null {
  const parsedUrl = parseSourceUrl(url);

  if (typeof parsedUrl === "string") {
    return parsedUrl;
  }

  return getBlockedHostError(parsedUrl.hostname);
}

async function resolveSourceTarget(
  url: string,
  lookupFn: LookupFn = lookup,
): Promise<ResolvedSourceTarget> {
  const parsedUrl = parseSourceUrl(url);

  if (typeof parsedUrl === "string") {
    throw new Error(parsedUrl);
  }

  const directHostError = getBlockedHostError(parsedUrl.hostname);

  if (directHostError) {
    throw new Error(directHostError);
  }

  const normalizedHostname = normalizeIpAddress(parsedUrl.hostname);
  const ipVersion = isIP(normalizedHostname);

  if (ipVersion !== 0) {
    return {
      address: normalizedHostname,
      family: ipVersion,
      url: parsedUrl,
    };
  }

  const resolvedAddresses = await lookupFn(normalizedHostname, {
    all: true,
    verbatim: true,
  });

  if (resolvedAddresses.length === 0) {
    throw new Error("Source hostname did not resolve.");
  }

  const allowedAddress = resolvedAddresses.find(
    (resolvedAddress) => getBlockedHostError(resolvedAddress.address) === null,
  );

  if (!allowedAddress) {
    throw new Error(BLOCKED_SOURCE_URL_ERROR);
  }

  return {
    address: normalizeIpAddress(allowedAddress.address),
    family: allowedAddress.family,
    url: parsedUrl,
  };
}

export async function getResolvedSourceUrlError(
  url: string,
  lookupFn: LookupFn = lookup,
): Promise<string | null> {
  try {
    await resolveSourceTarget(url, lookupFn);
    return null;
  } catch (error) {
    return getSyncErrorMessage(error);
  }
}

async function readResponseBody(response: IncomingMessage): Promise<string> {
  const contentEncoding = response.headers["content-encoding"];
  let stream: NodeJS.ReadableStream = response;

  if (contentEncoding === "br") {
    stream = response.pipe(createBrotliDecompress());
  } else if (contentEncoding === "gzip") {
    stream = response.pipe(createGunzip());
  } else if (contentEncoding === "deflate") {
    stream = response.pipe(createInflate());
  }

  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function requestSourceFeed(
  target: ResolvedSourceTarget,
  signal?: AbortSignal,
): Promise<{
  headers: IncomingHttpHeaders;
  status: number;
  text: string;
}> {
  const requestFn = target.url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = requestFn(
      target.url,
      {
        headers: {
          accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, target.address, target.family);
        },
        signal,
      },
      async (response) => {
        try {
          resolve({
            headers: response.headers,
            status: response.statusCode ?? 0,
            text: await readResponseBody(response),
          });
        } catch (error) {
          reject(error);
        }
      },
    );

    request.on("error", reject);
    request.end();
  });
}

export async function fetchSourceFeed(
  url: string,
  options?: {
    fetchImpl?: FetchLike;
    lookupFn?: LookupFn;
    signal?: AbortSignal;
  },
): Promise<string> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const lookupFn = options?.lookupFn ?? lookup;
  const signal = options?.signal;
  let currentUrl = url;

  for (
    let redirectDepth = 0;
    redirectDepth <= SOURCE_SYNC_MAX_REDIRECTS;
    redirectDepth += 1
  ) {
    if (options?.fetchImpl) {
      const blockedSourceError = await getResolvedSourceUrlError(
        currentUrl,
        lookupFn,
      );

      if (blockedSourceError) {
        throw new Error(blockedSourceError);
      }

      const response = await fetchImpl(currentUrl, {
        cache: "no-store",
        redirect: "manual",
        signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");

        if (!location) {
          throw new Error("Feed redirect response was missing a Location header.");
        }

        if (redirectDepth === SOURCE_SYNC_MAX_REDIRECTS) {
          throw new Error("Feed request exceeded redirect limit.");
        }

        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`Feed request failed with ${response.status}`);
      }

      return response.text();
    }

    const target = await resolveSourceTarget(currentUrl, lookupFn);
    const response = await requestSourceFeed(target, signal);

    if (response.status >= 300 && response.status < 400) {
      const locationHeader = response.headers.location;
      const location = Array.isArray(locationHeader)
        ? locationHeader[0]
        : locationHeader;

      if (!location) {
        throw new Error("Feed redirect response was missing a Location header.");
      }

      if (redirectDepth === SOURCE_SYNC_MAX_REDIRECTS) {
        throw new Error("Feed request exceeded redirect limit.");
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Feed request failed with ${response.status}`);
    }

    return response.text;
  }

  throw new Error("Feed request exceeded redirect limit.");
}
