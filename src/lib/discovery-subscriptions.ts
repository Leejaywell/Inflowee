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
import { createSourceSchema } from "@/lib/validation";
import type { DiscoverySourceCandidate } from "@/lib/discovery-catalog";

function normalizeUrl(value: string) {
  return value.trim().toLowerCase();
}

export async function createDiscoverySourcesForTask(
  store: Store,
  taskId: string,
  candidates: DiscoverySourceCandidate[],
) {
  const task = await getTaskById(store, taskId);

  if (!task) {
    throw new Error("Task not found.");
  }

  const existingSources = await listSourcesByTask(store, taskId);
  const knownUrls = new Set(existingSources.map((source) => normalizeUrl(source.url)));
  const createdSourceIds: string[] = [];
  const skippedCandidateIds: string[] = [];

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
      ? buildHotlistSourceUrl()
      : isDiscovery
        ? buildRadarSourceUrl(parsed.data.sourceType)
        : parsed.data.url;
    const normalizedUrl = normalizeUrl(url);

    if (knownUrls.has(normalizedUrl)) {
      skippedCandidateIds.push(candidate.id);
      continue;
    }

    const sourceId = await createSourceRecord(store, {
      taskId,
      sourceType: parsed.data.sourceType,
      title: parsed.data.title,
      url,
      configJson: isHotlist
        ? buildHotlistSourceConfig(task)
        : isDiscovery
          ? buildRadarSourceConfig(task, parsed.data.sourceType)
          : candidate.configJson ?? null,
    });

    knownUrls.add(normalizedUrl);
    createdSourceIds.push(sourceId);
  }

  return {
    createdSourceIds,
    skippedCandidateIds,
  };
}
