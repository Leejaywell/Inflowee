"use server";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createItemRecord,
  createSourceRecord,
  createSpaceRecord,
  createTaskRecord,
  defaultStore,
  getSourceById,
  hasTaskRecord,
  markSourceSyncResult,
} from "@/lib/store";
import { parseFeedItems } from "@/lib/rss";
import { createSourceSchema, createSpaceSchema, createTaskSchema } from "@/lib/validation";

const SOURCE_SYNC_TIMEOUT_MS = 10_000;
const SOURCE_SYNC_MAX_REDIRECTS = 5;
const BLOCKED_SOURCE_URL_ERROR = "Source URL targets a blocked local or private address.";

type LookupResult = {
  address: string;
  family: number;
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

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
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

export function getBlockedSourceUrlError(url: string): string | null {
  const parsedUrl = parseSourceUrl(url);

  if (typeof parsedUrl === "string") {
    return parsedUrl;
  }

  return getBlockedHostError(parsedUrl.hostname);
}

export async function getResolvedSourceUrlError(
  url: string,
  lookupFn: LookupFn = lookup,
): Promise<string | null> {
  const parsedUrl = parseSourceUrl(url);

  if (typeof parsedUrl === "string") {
    return parsedUrl;
  }

  const directHostError = getBlockedHostError(parsedUrl.hostname);

  if (directHostError) {
    return directHostError;
  }

  const normalizedHostname = normalizeIpAddress(parsedUrl.hostname);

  if (isIP(normalizedHostname) !== 0) {
    return null;
  }

  const resolvedAddresses = await lookupFn(normalizedHostname, {
    all: true,
    verbatim: true,
  });

  if (resolvedAddresses.length === 0) {
    throw new Error("Source hostname did not resolve.");
  }

  for (const resolvedAddress of resolvedAddresses) {
    const blockedAddressError = getBlockedHostError(resolvedAddress.address);

    if (blockedAddressError) {
      return blockedAddressError;
    }
  }

  return null;
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

  for (let redirectDepth = 0; redirectDepth <= SOURCE_SYNC_MAX_REDIRECTS; redirectDepth += 1) {
    const blockedSourceError = await getResolvedSourceUrlError(currentUrl, lookupFn);

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

  throw new Error("Feed request exceeded redirect limit.");
}

export async function createSpace(formData: FormData) {
  const parsed = createSpaceSchema.safeParse({
    name: getString(formData, "name"),
    description: getString(formData, "description"),
  });

  if (!parsed.success) {
    redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid space input.")}`);
  }

  createSpaceRecord(parsed.data);

  revalidatePath("/");
  redirect("/?created=space");
}

export async function createTask(formData: FormData) {
  const parsed = createTaskSchema.safeParse({
    spaceId: getString(formData, "spaceId"),
    title: getString(formData, "title"),
    taskType: getString(formData, "taskType"),
    userPrompt: getString(formData, "userPrompt"),
  });

  if (!parsed.success) {
    redirect(`/?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid task input.")}`);
  }

  createTaskRecord(parsed.data);

  revalidatePath("/");
  redirect("/?created=task");
}

export async function createSource(formData: FormData) {
  const parsed = createSourceSchema.safeParse({
    taskId: getString(formData, "taskId"),
    sourceType: getString(formData, "sourceType"),
    title: getString(formData, "title"),
    url: getString(formData, "url"),
  });

  if (!parsed.success) {
    redirect(`/sources?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid source input.")}`);
  }

  const taskExists = hasTaskRecord(defaultStore, parsed.data.taskId);

  if (!taskExists) {
    redirect("/sources?error=Select%20a%20valid%20task.");
  }

  let destination = "/sources?created=source";

  try {
    createSourceRecord(defaultStore, parsed.data);
  } catch {
    destination = "/sources?error=Unable%20to%20create%20source.";
  }

  revalidatePath("/sources");
  redirect(destination);
}

export async function runSourceSync(formData: FormData) {
  const sourceId = getString(formData, "sourceId");
  const source = getSourceById(defaultStore, sourceId);

  if (!source) {
    redirect("/sources?error=Source%20not%20found.");
  }

  const blockedSourceError = getBlockedSourceUrlError(source.url);

  if (blockedSourceError) {
    markSourceSyncResult(defaultStore, {
      sourceId: source.id,
      status: "error",
      error: blockedSourceError,
    });

    revalidatePath("/sources");
    redirect(`/sources?error=${encodeURIComponent(blockedSourceError)}`);
  }

  let syncError: string | null = null;

  try {
    const xml = await fetchSourceFeed(source.url, {
      signal: AbortSignal.timeout(SOURCE_SYNC_TIMEOUT_MS),
    });
    const items = parseFeedItems(xml);

    if (items.length === 0) {
      throw new Error("Feed returned no supported items.");
    }

    for (const item of items) {
      createItemRecord(defaultStore, {
        sourceId: source.id,
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        summary: item.summary,
        publishedAt: item.publishedAt,
      });
    }

    markSourceSyncResult(defaultStore, {
      sourceId: source.id,
      status: "success",
    });
  } catch (error) {
    syncError = getSyncErrorMessage(error);

    markSourceSyncResult(defaultStore, {
      sourceId: source.id,
      status: "error",
      error: syncError,
    });
  }

  revalidatePath("/sources");

  if (syncError) {
    redirect(`/sources?error=${encodeURIComponent(syncError)}`);
  }

  redirect("/sources?synced=source");
}
