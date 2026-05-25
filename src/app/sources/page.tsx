import {
  deleteSource,
  runSourceSync,
  runSyncAll,
  updateSourceSchedule,
} from "@/app/actions";
import Link from "next/link";
import { AddSourceModal } from "@/components/add-source-modal";
import { SourceTestFetch } from "@/components/source-test-fetch";
import { MetricPill, Notice, PageHeader, Surface } from "@/components/ui-shell";
import { requireSessionActor } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";
import { discoveryCategories } from "@/lib/discovery-catalog";
import {
  defaultStore,
  getSourceHealthSummary,
  listRecentSyncRunsBySource,
  listRecentSyncRuns,
  listSources,
  listTopics,
  type SyncRunRecord,
  type SourceRecord,
  type SourceStatus,
} from "@/lib/store";

type SourcesPageProps = {
  searchParams?: Promise<{
    created?: string;
    error?: string;
    synced?: string;
    updated?: string;
  }>;
};

const statusClasses: Record<SourceStatus, string> = {
  idle: "bg-stone-100 text-stone-600",
  success: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
};

type SourceWithRuns = SourceRecord & {
  recentRuns: SyncRunRecord[];
};

export default async function SourcesPage({ searchParams }: SourcesPageProps) {
  const [actor, locale] = await Promise.all([
    requireSessionActor(),
    getRequestLocale(),
  ]);
  const t = getDictionary(locale).sources;
  const isZh = locale === "zh";
  const statusLabels: Record<SourceStatus, string> = {
    idle: t.statusIdle,
    success: t.statusSuccess,
    error: t.statusError,
  };
  const [topicsRaw, sources, healthSummary, recentRuns, params] = await Promise.all([
    listTopics(defaultStore, { actorId: actor.id }),
    listSources(defaultStore, { actorId: actor.id }),
    getSourceHealthSummary(defaultStore, { actorId: actor.id }),
    listRecentSyncRuns(defaultStore, 10, { actorId: actor.id }),
    searchParams,
  ]);
  const categoryOptions = discoveryCategories;
  const topicById = new Map(topicsRaw.map((topic) => [topic.id, topic]));
  const sourcesByCategory = new Map<string, SourceWithRuns[]>();
  const sourceById = new Map<string, SourceRecord>();

  for (const source of sources) {
    sourceById.set(source.id, source);
    const categorySources = sourcesByCategory.get(source.categoryId) ?? [];
    categorySources.push({
      ...source,
      recentRuns: await listRecentSyncRunsBySource(defaultStore, source.id),
    });
    sourcesByCategory.set(source.categoryId, categorySources);
  }

  const sourceGroups = categoryOptions
    .map((category) => ({
      ...category,
      sources: sourcesByCategory.get(category.id) ?? [],
    }))
    .filter((category) => category.id === "all" || category.sources.length > 0);
  const created = params?.created;
  const error = params?.error;
  const synced = params?.synced;
  const updated = params?.updated;
  const totalSources = sources.length;

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow={t.badge}
        title={t.title}
        metrics={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricPill value={healthSummary.healthy} label={t.healthy} tone="success" />
            <MetricPill
              value={healthSummary.errored}
              label={t.failing}
              tone={healthSummary.errored > 0 ? "danger" : "default"}
            />
            <MetricPill value={healthSummary.idle} label={t.idle} />
            <MetricPill
              value={healthSummary.dueNow}
              label={t.dueNow}
              tone={healthSummary.dueNow > 0 ? "warning" : "default"}
            />
          </div>
        }
      />

      {(created || error || synced || updated) && (
        <Notice tone={error ? "danger" : "success"}>
          {error
            ? decodeURIComponent(error)
            : created === "source"
              ? t.created
              : synced === "source"
                ? t.synced
                : synced === "all"
                  ? t.syncedAll
                  : updated === "schedule"
                    ? t.cadenceUpdated
                    : t.updateApplied}
        </Notice>
      )}

      {/* Main: source list (left) + add forms (right) */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Source library */}
        <Surface>
          <div className="mb-5 flex items-center justify-between border-b border-stone-100 pb-5">
            <h2 className="text-xl font-semibold">{isZh ? "来源库" : "Source library"}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.14em] text-stone-400">
                {totalSources} {t.sources}
              </span>
              {sources.length > 0 && (
                <form action={runSyncAll}>
                  <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-900 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-stone-800">
                    {t.syncAll}
                  </button>
                </form>
              )}
            </div>
          </div>

          {sources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
              {isZh
                ? "还没有来源。可以添加自定义来源，或在发现页通过 AI 分析需求后选择来源。"
                : "No sources yet. Add a custom source, or use Discover to analyze a need and pick sources."}
            </div>
          ) : (
            <div className="grid gap-5">
              {sourceGroups.map((category) => (
                <div key={category.id}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-base font-semibold text-stone-950">
                      {category.title}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
                      {category.sources.length} {t.sources}
                    </span>
                  </div>

                  {category.sources.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                      {isZh ? "这个分类下还没有来源。" : "No sources in this category yet."}
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {category.sources.map((source) => (
                        <div
                          key={source.id}
                          className="rounded-2xl bg-stone-50 p-4 shadow-[0_4px_16px_rgba(33,24,9,0.04)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-medium text-stone-950">
                              {source.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-600">
                                {t.sourceTypeLabels[source.sourceType as keyof typeof t.sourceTypeLabels] ?? source.sourceType}
                              </span>
                              {source.topicId ? (
                                <Link
                                  href={`/topics/${source.topicId}`}
                                  className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#0057ff] hover:underline"
                                >
                                  {topicById.get(source.topicId)?.title ??
                                    (isZh ? "探索" : "Exploration")}
                                </Link>
                              ) : (
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-500">
                                  {isZh ? "自定义" : "Custom"}
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[source.status]}`}
                              >
                                {statusLabels[source.status]}
                              </span>
                              <form action={runSourceSync}>
                                <input name="sourceId" type="hidden" value={source.id} />
                                <button className="inline-flex h-8 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50">
                                  {t.syncNow}
                                </button>
                              </form>
                              <Link
                                href={`/sources/${source.id}`}
                                className="inline-flex h-8 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
                              >
                                {t.diagnostics}
                              </Link>
                              <form action={deleteSource}>
                                <input name="sourceId" type="hidden" value={source.id} />
                                <button className="inline-flex h-8 items-center justify-center rounded-xl border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50">
                                  {t.delete}
                                </button>
                              </form>
                            </div>
                          </div>
                          <p className="mt-2 break-all text-xs leading-5 text-stone-500">
                            {source.url}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-stone-200/60 pt-3">
                            <form
                              action={updateSourceSchedule}
                              className="flex items-center gap-2"
                            >
                              <input name="sourceId" type="hidden" value={source.id} />
                              <select
                                name="syncIntervalMinutes"
                                defaultValue={String(source.syncIntervalMinutes)}
                                className="h-8 rounded-xl border border-stone-200 bg-white px-3 text-xs text-stone-600"
                              >
                                <option value="15">{t.every15Min}</option>
                                <option value="60">{t.every60Min}</option>
                                <option value="360">{t.every6Hr}</option>
                                <option value="1440">{t.daily}</option>
                              </select>
                              <button className="inline-flex h-8 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition hover:bg-stone-50">
                                {t.saveCadence}
                              </button>
                            </form>
                            <span className="text-xs text-stone-400">
                              {t.nextSync}{" "}
                              {source.nextSyncAt
                                ? new Date(source.nextSyncAt).toLocaleString("en-US", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : t.notScheduled}
                            </span>
                          </div>

                          {source.recentRuns.length > 0 && (
                            <div className="mt-3 rounded-xl bg-white px-3 py-2">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                                {t.recentRuns}
                              </p>
                              <ul className="grid gap-1">
                                {source.recentRuns.map((run: SyncRunRecord) => (
                                  <li
                                    key={run.id}
                                    className="flex items-center justify-between gap-3 text-xs text-stone-500"
                                  >
                                    <span
                                      className={`font-medium ${
                                        run.status === "success"
                                          ? "text-emerald-600"
                                          : run.status === "error"
                                            ? "text-rose-600"
                                            : "text-stone-700"
                                      }`}
                                    >
                                      {run.status}
                                    </span>
                                    <span>
                                      {run.insertedItemCount} {t.items} /{" "}
                                      {run.createdBriefCount} {t.briefs}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Surface>

        {/* Right: Add source forms */}
        <div className="grid content-start gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto">
            {/* Add custom source modal */}
          <AddSourceModal
            categoryOptions={categoryOptions}
            isZh={isZh}
            labels={{
              addSource: t.addSource,
              addSourceDescription: t.addSourceDescription,
              sourceType: t.sourceType,
              sourceTitle: t.sourceTitle,
              feedUrl: t.feedUrl,
              telegramHelp: t.telegramHelp,
              saveSource: t.saveSource,
            }}
          />

          <SourceTestFetch isZh={isZh} />

          <Link
            href="/discover"
            className="flex items-center justify-between rounded-[20px] border border-[#0057ff]/20 bg-[#0057ff]/5 px-5 py-4 text-sm font-semibold text-[#0057ff] transition hover:bg-[#0057ff]/10"
          >
            <span>{isZh ? "通过 AI 发现更多来源 →" : "Discover more sources with AI →"}</span>
          </Link>
        </div>
      </div>

      {/* Recent sync activity */}
      <Surface>
        <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
          <div>
            <h2 className="text-xl font-semibold">{t.recentSyncRuns}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">{t.recentSyncDescription}</p>
          </div>
          <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
            {recentRuns.length} {t.entries}
          </span>
        </div>

        {recentRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
            {t.noSyncRuns}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentRuns.map((run) => {
              const source = sourceById.get(run.sourceId);

              return (
                <article
                  key={run.id}
                  className="rounded-[16px] border border-stone-100 bg-stone-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-medium text-stone-900">
                        {source ? (
                          <Link
                            href={`/sources/${source.id}`}
                            className="hover:text-[#0057ff]"
                          >
                            {source.title}
                          </Link>
                        ) : (
                          run.sourceId
                        )}
                      </p>
                      <p className="text-xs uppercase tracking-[0.12em] text-stone-400">
                        {new Date(run.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        run.status === "success"
                          ? "bg-emerald-100 text-emerald-700"
                          : run.status === "error"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-stone-200 text-stone-700"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-stone-500">
                    <span>{run.insertedItemCount} {t.items}</span>
                    <span>{run.createdBriefCount} {t.briefs}</span>
                    {run.error && <span className="text-rose-500 truncate">{run.error}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Surface>
    </div>
  );
}
