import {
  createSourceRecord,
  getTaskById,
  listSourcesByTask,
  type Store,
} from "@/lib/store";
import { buildHotlistSourceConfig, buildHotlistSourceUrl } from "@/lib/hotlist-discovery";
import {
  buildRadarSourceConfig,
  buildRadarSourceUrl,
} from "@/lib/radar-discovery";
import { syncSourceById, type SyncSourceResult } from "@/lib/source-ingestion";
import { createSourceSchema } from "@/lib/validation";
import type { DiscoverySourceCandidate } from "@/lib/discovery-catalog";

function normalizeUrl(value: string) {
  return value.trim().toLowerCase();
}

function sourceDedupKey(input: {
  sourceType: string;
  url: string;
  configJson?: Record<string, unknown> | null;
}) {
  if (input.sourceType.includes("DISCOVERY")) {
    return `${input.sourceType}:${normalizeUrl(input.url)}:${JSON.stringify(input.configJson ?? {})}`;
  }

  return normalizeUrl(input.url);
}

export async function createDiscoverySourcesForTask(
  store: Store,
  taskId: string,
  candidates: DiscoverySourceCandidate[],
  options: { syncImmediately?: boolean } = {},
) {
  const task = await getTaskById(store, taskId);

  if (!task) {
    throw new Error("Task not found.");
  }

  const existingSources = await listSourcesByTask(store, taskId);
  const knownUrls = new Set(
    existingSources.map((source) =>
      sourceDedupKey({
        sourceType: source.sourceType,
        url: source.url,
        configJson: source.configJson,
      }),
    ),
  );
  const createdSourceIds: string[] = [];
  const skippedCandidateIds: string[] = [];
  const syncResults: SyncSourceResult[] = [];

  for (const candidate of candidates) {
    const parsed = createSourceSchema.safeParse({
      taskId,
      sourceType: candidate.sourceType,
      title: candidate.title,
      url: candidate.url,
    });

    if (!parsed.success) {
      skippedCandidateIds.push(candidate.id);
      continue;
    }

    const isDiscovery =
      parsed.data.sourceType === "SEARCH_DISCOVERY" ||
      parsed.data.sourceType === "COMMUNITY_DISCOVERY" ||
      parsed.data.sourceType === "SOCIAL_DISCOVERY" ||
      parsed.data.sourceType === "HOTLIST_DISCOVERY";
    const isHotlist = parsed.data.sourceType === "HOTLIST_DISCOVERY";
    const url = isHotlist
      ? (candidate.url || buildHotlistSourceUrl())
      : isDiscovery
        ? (candidate.url || buildRadarSourceUrl(parsed.data.sourceType))
        : parsed.data.url;
    const configJson = isHotlist
      ? (candidate.configJson ?? buildHotlistSourceConfig(task))
      : isDiscovery
        ? (candidate.configJson ?? buildRadarSourceConfig(task, parsed.data.sourceType))
        : candidate.configJson ?? null;
    const normalizedUrl = sourceDedupKey({
      sourceType: parsed.data.sourceType,
      url,
      configJson,
    });

    if (knownUrls.has(normalizedUrl)) {
      skippedCandidateIds.push(candidate.id);
      continue;
    }

    const sourceId = await createSourceRecord(store, {
      taskId,
      sourceType: parsed.data.sourceType,
      title: parsed.data.title,
      url,
      configJson,
    });

    knownUrls.add(normalizedUrl);
    createdSourceIds.push(sourceId);

    if (options.syncImmediately) {
      syncResults.push(await syncSourceById(store, sourceId));
    }
  }

  return {
    createdSourceIds,
    skippedCandidateIds,
    syncedSourceCount: syncResults.filter((result) => result.ok).length,
    failedSyncCount: syncResults.filter((result) => !result.ok).length,
    insertedItemCount: syncResults.reduce(
      (count, result) => count + (result.ok ? result.insertedItemCount : 0),
      0,
    ),
    createdBriefCount: syncResults.reduce(
      (count, result) => count + (result.ok ? result.createdBriefCount : 0),
      0,
    ),
    syncErrors: syncResults
      .filter((result) => !result.ok)
      .map((result) => ({
        sourceTitle: result.source?.title ?? "Unknown source",
        error: result.error,
      })),
  };
}
