import {
  createPresetSource,
  createSource,
  deleteSource,
  runSourceSync,
  runSyncAll,
  updateSourceSchedule,
} from "@/app/actions";
import Link from "next/link";
import { requireSessionActor } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";
import {
  defaultStore,
  getSourceHealthSummary,
  listRecentSyncRunsBySource,
  listRecentSyncRuns,
  listSources,
  listTasks,
  type SyncRunRecord,
  type SourceRecord,
  type SourceStatus,
} from "@/lib/store";
import { sourcePresets } from "@/lib/source-presets";

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
  const [tasksRaw, sources, healthSummary, recentRuns, params] = await Promise.all([
    listTasks(defaultStore, { actorId: actor.id }),
    listSources(defaultStore, { actorId: actor.id }),
    getSourceHealthSummary(defaultStore, { actorId: actor.id }),
    listRecentSyncRuns(defaultStore, 10, { actorId: actor.id }),
    searchParams,
  ]);
  const sourcesByTask = new Map<string, SourceWithRuns[]>();
  const sourceById = new Map<string, SourceRecord>();

  for (const source of sources) {
    sourceById.set(source.id, source);
    const taskSources = sourcesByTask.get(source.taskId) ?? [];
    taskSources.push({
      ...source,
      recentRuns: await listRecentSyncRunsBySource(defaultStore, source.id),
    });
    sourcesByTask.set(source.taskId, taskSources);
  }

  const tasks = tasksRaw.map((task) => ({
    ...task,
    sources: sourcesByTask.get(task.id) ?? [],
  }));
  const created = params?.created;
  const error = params?.error;
  const synced = params?.synced;
  const updated = params?.updated;
  const totalSources = tasks.reduce((count, task) => count + task.sources.length, 0);

  return (
    <div className="grid gap-5">
      {/* Header with health strip */}
      <section className="rounded-[18px] border border-stone-900/10 bg-white px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-[#0057ff] px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white">
              {t.badge}
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
              {t.title}
            </h1>
            <p className="mt-1 text-sm leading-6 text-stone-500">{t.description}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-center">
              <div className="text-xl font-semibold text-emerald-800">
                {healthSummary.healthy}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                {t.healthy}
              </div>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-center">
              <div className="text-xl font-semibold text-rose-800">
                {healthSummary.errored}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-600">
                {t.failing}
              </div>
            </div>
            <div className="rounded-2xl bg-stone-100 px-4 py-3 text-center">
              <div className="text-xl font-semibold text-stone-700">
                {healthSummary.idle}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                {t.idle}
              </div>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-center">
              <div className="text-xl font-semibold text-amber-800">
                {healthSummary.dueNow}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-600">
                {t.dueNow}
              </div>
            </div>
          </div>
        </div>
      </section>

      {(created || error || synced || updated) && (
        <section
          className={`rounded-2xl border px-5 py-4 text-sm ${
            error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
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
        </section>
      )}

      {/* Main: source list (left) + add forms (right) */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Source library */}
        <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <div className="mb-5 flex items-center justify-between border-b border-stone-100 pb-5">
            <div>
              <h2 className="text-xl font-semibold">{t.taskSources}</h2>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                {t.taskSourcesDescription}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.14em] text-stone-400">
                {totalSources} {t.sources}
              </span>
              {tasks.length > 0 && tasks.some((tk) => tk.sources.length > 0) && (
                <form action={runSyncAll}>
                  <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-900 px-4 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-stone-800">
                    {t.syncAll}
                  </button>
                </form>
              )}
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
              {t.noTasks}
            </div>
          ) : (
            <div className="grid gap-5">
              {tasks.map((task) => (
                <div key={task.id}>
                  <div className="mb-3 flex items-center gap-2">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="text-base font-semibold text-stone-950 hover:text-[#0057ff]"
                    >
                      {task.title}
                    </Link>
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
                      {task.sources.length} {t.sources}
                    </span>
                  </div>

                  {task.sources.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                      {t.noSourcesForTask}
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {task.sources.map((source) => (
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
                                {source.sourceType}
                              </span>
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
        </section>

        {/* Right: Add source forms */}
        <div className="grid content-start gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-y-auto">
          {/* Custom source form */}
          <form
            action={createSource}
            className="rounded-[24px] border border-stone-900/10 bg-white p-5 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
          >
            <div className="mb-4 space-y-0.5">
              <h2 className="text-base font-semibold">{t.addSource}</h2>
              <p className="text-xs leading-5 text-stone-500">{t.addSourceDescription}</p>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {t.task}
                </span>
                <select
                  name="taskId"
                  className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                  defaultValue=""
                >
                  <option value="" disabled>
                    {t.selectTask}
                  </option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {t.sourceType}
                </span>
                <select
                  name="sourceType"
                  className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                  defaultValue="RSS"
                >
                  <option value="RSS">RSS Feed</option>
                  <option value="PAGE">Web Page</option>
                  <option value="STRUCTURED">Structured List</option>
                  <option value="UPDATE">Update Feed</option>
                  <option value="NEWSLETTER">Newsletter Archive</option>
                  <option value="TELEGRAM_PUBLIC">Telegram Public Feed</option>
                  <option value="TELEGRAM_BOT">Telegram Bot Feed</option>
                  <option value="HOTLIST_DISCOVERY">Hotlist Discovery</option>
                </select>
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {t.sourceTitle}
                </span>
                <input
                  name="title"
                  placeholder="OpenAI Blog RSS"
                  className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {t.feedUrl}
                </span>
                <input
                  name="url"
                  placeholder="https://example.com/feed.xml"
                  className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </label>
              <p className="text-xs leading-5 text-stone-400">{t.telegramHelp}</p>

              <button
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0057ff] px-4 text-sm font-medium text-white transition hover:bg-[#0049d6] disabled:opacity-50"
                disabled={tasks.length === 0}
              >
                {t.saveSource}
              </button>
            </div>
          </form>

          {/* Built-in sources */}
          <form
            action={createPresetSource}
            className="rounded-[24px] border border-stone-900/10 bg-white p-5 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
          >
            <div className="mb-4 space-y-0.5">
              <h2 className="text-base font-semibold">{t.builtInSources}</h2>
              <p className="text-xs leading-5 text-stone-500">{t.builtInDescription}</p>
            </div>

            <label className="mb-4 grid gap-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                {t.task}
              </span>
              <select
                name="taskId"
                className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                defaultValue=""
              >
                <option value="" disabled>
                  {t.selectTask}
                </option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2">
              {sourcePresets.map((preset) => (
                <article
                  key={preset.id}
                  className="rounded-[16px] border border-stone-200 bg-stone-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-stone-900">
                          {preset.title}
                        </h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-stone-500">
                          {preset.category}
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-stone-600">
                        {preset.description}
                      </p>
                    </div>
                    <button
                      type="submit"
                      name="presetId"
                      value={preset.id}
                      className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-stone-900 px-3 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-stone-800 disabled:opacity-40"
                      disabled={tasks.length === 0}
                    >
                      {t.add}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </form>

          <Link
            href="/discover"
            className="flex items-center justify-between rounded-[20px] border border-[#0057ff]/20 bg-[#0057ff]/5 px-5 py-4 text-sm font-semibold text-[#0057ff] transition hover:bg-[#0057ff]/10"
          >
            <span>{isZh ? "通过 AI 发现更多来源 →" : "Discover more sources with AI →"}</span>
          </Link>
        </div>
      </div>

      {/* Recent sync activity */}
      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
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
      </section>
    </div>
  );
}
