import {
  createReportRecord,
  getTopicById,
  listBriefsFiltered,
  listItemsBySource,
  listReportsByTopic,
  listSourcesByTopic,
  type BriefRecord,
  type ItemRecord,
  type ReportMode,
  type ReportRecord,
  type Store,
} from "@/lib/store";

export type GenerateReportOptions = {
  mode: ReportMode;
  now?: Date;
};

type ReportWindow = {
  start: Date | null;
  end: Date;
};

function getReportWindow(
  mode: ReportMode,
  previousReports: ReportRecord[],
  now: Date,
): ReportWindow {
  if (mode === "daily") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (mode === "incremental") {
    const previous = previousReports[0]?.createdAt;
    return { start: previous ? new Date(previous) : null, end: now };
  }

  return { start: null, end: now };
}

function isInsideWindow(value: string | null, window: ReportWindow) {
  if (!value) {
    return true;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return true;
  }

  if (timestamp > window.end.getTime()) {
    return false;
  }

  return window.start ? timestamp >= window.start.getTime() : true;
}

function collectTags(briefs: BriefRecord[], items: ItemRecord[]) {
  const counts = new Map<string, number>();

  for (const tag of briefs.flatMap((brief) => brief.tags)) {
    counts.set(tag, (counts.get(tag) ?? 0) + 2);
  }

  for (const term of items.flatMap((item) => item.matchedTerms ?? [])) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));
}

function buildMarkdown(input: {
  title: string;
  summary: string;
  trends: string[];
  disputes: string[];
  weakSignals: string[];
  nextWatch: string[];
  citations: string[];
}) {
  const section = (title: string, rows: string[]) =>
    [`## ${title}`, ...(rows.length > 0 ? rows.map((row) => `- ${row}`) : ["- No clear signal yet."])].join("\n");

  return [
    `# ${input.title}`,
    "",
    input.summary,
    "",
    section("Core Trends", input.trends),
    "",
    section("Disputes And Diverging Views", input.disputes),
    "",
    section("Weak Signals", input.weakSignals),
    "",
    section("Suggested Next Watch Points", input.nextWatch),
    "",
    section("Sources", input.citations),
  ].join("\n");
}

export async function generateTopicReport(
  store: Store,
  topicId: string,
  options: GenerateReportOptions,
) {
  const topic = await getTopicById(store, topicId);
  if (!topic) {
    throw new Error("Topic not found.");
  }

  const previousReports = await listReportsByTopic(store, topicId);
  const now = options.now ?? new Date();
  const window = getReportWindow(options.mode, previousReports, now);
  const [briefs, sources] = await Promise.all([
    listBriefsFiltered(store, { topicId }),
    listSourcesByTopic(store, topicId),
  ]);
  const sourceItems = await Promise.all(
    sources.map((source) => listItemsBySource(store, source.id)),
  );
  const items = sourceItems
    .flat()
    .filter((item) => item.qualityStatus === "accepted")
    .filter((item) => isInsideWindow(item.publishedAt ?? item.createdAt, window));
  const windowBriefs = briefs.filter((brief) => isInsideWindow(brief.createdAt, window));
  const tags = collectTags(windowBriefs, items);
  const topBriefs = windowBriefs.slice(0, 5);
  const topItems = items.slice(0, 8);
  const citations = [
    ...new Set([
      ...topBriefs.flatMap((brief) => brief.sourceCitations),
      ...topItems.map((item) => item.canonicalUrl),
    ]),
  ].slice(0, 12);
  const reportTitle = `${topic.title} ${options.mode} trend report`;
  const summary =
    topBriefs.length > 0
      ? `Found ${topBriefs.length} briefs and ${items.length} accepted items for this report window.`
      : `Found ${items.length} accepted items for this report window.`;
  const trends = tags.map((tag) => `${tag.tag} appeared in ${tag.count} weighted signals.`);
  const disputes = topBriefs
    .filter((brief) => brief.whyItMatters)
    .slice(0, 3)
    .map((brief) => `${brief.title}: ${brief.whyItMatters}`);
  const weakSignals = topItems
    .filter((item) => (item.relevanceScore ?? 0) < 0.75)
    .slice(0, 3)
    .map((item) => `${item.title}: ${item.relevanceReason ?? "watch for follow-up coverage"}`);
  const nextWatch =
    tags.length > 0
      ? tags.slice(0, 3).map((tag) => `Track whether "${tag.tag}" keeps appearing in new sources.`)
      : [`Add or sync more sources for "${topic.title}" to establish a clearer trend baseline.`];
  const content = {
    mode: options.mode,
    trends,
    disputes,
    weakSignals,
    nextWatch,
    tags,
    itemCount: items.length,
    briefCount: windowBriefs.length,
  };
  const markdown = buildMarkdown({
    title: reportTitle,
    summary,
    trends,
    disputes,
    weakSignals,
    nextWatch,
    citations,
  });
  const reportId = await createReportRecord(store, {
    topicId,
    mode: options.mode,
    title: reportTitle,
    summary,
    content,
    markdown,
    itemIds: topItems.map((item) => item.id),
    briefIds: topBriefs.map((brief) => brief.id),
    sourceCitations: citations,
    periodStart: window.start?.toISOString() ?? null,
    periodEnd: window.end.toISOString(),
  });

  return reportId;
}
