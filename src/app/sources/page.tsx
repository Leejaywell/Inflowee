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
  const statusLabels: Record<SourceStatus, string> = {
    idle: t.statusIdle,
    success: t.statusSuccess,
    error: t.statusError,
  };
  const [tasksRaw, sources, healthSummary, recentRuns, params] = await Promise.all([
    listTasks(defaultStore, { actorId: actor.id }),
    listSources(defaultStore, { actorId: actor.id }),
    getSourceHealthSummary(defaultStore, { actorId: actor.id }),
    listRecentSyncRuns(defaultStore, 12, { actorId: actor.id }),
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

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <span className="inline-flex rounded-full bg-[#0057ff] px-3 py-1 text-xs font-medium tracking-[0.18em] text-white uppercase">
            {t.badge}
          </span>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              {t.title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
              {t.description}
            </p>
          </div>
        </div>

        <div className="grid gap-4 rounded-[22px] bg-stone-950 p-5 text-stone-50">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-stone-400">
              {t.snapshot}
            </p>
            <p className="mt-3 text-4xl font-semibold">{tasks.length}</p>
            <p className="text-sm text-stone-300">{t.tasksAvailable}</p>
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="text-4xl font-semibold">
              {tasks.reduce((count, task) => count + task.sources.length, 0)}
            </p>
            <p className="text-sm text-stone-300">{t.sourcesConnected}</p>
          </div>
          <div className="border-t border-white/10 pt-4 text-sm text-stone-300">
            {t.healthLine
              .replace("{healthy}", String(healthSummary.healthy))
              .replace("{errored}", String(healthSummary.errored))
              .replace("{dueNow}", String(healthSummary.dueNow))}
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

      <section className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="text-xl font-semibold">{t.sourceHealth}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-emerald-700">
                {t.healthy}
              </div>
              <div className="mt-2 text-2xl font-semibold text-emerald-800">
                {healthSummary.healthy}
              </div>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-rose-700">
                {t.failing}
              </div>
              <div className="mt-2 text-2xl font-semibold text-rose-800">
                {healthSummary.errored}
              </div>
            </div>
            <div className="rounded-2xl bg-stone-100 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-stone-500">
                {t.idle}
              </div>
              <div className="mt-2 text-2xl font-semibold text-stone-700">
                {healthSummary.idle}
              </div>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-amber-700">
                {t.dueNow}
              </div>
              <div className="mt-2 text-2xl font-semibold text-amber-800">
                {healthSummary.dueNow}
              </div>
            </div>
          </div>
        </div>

        <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{t.recentSyncRuns}</h2>
              <p className="text-sm leading-6 text-stone-500">
                {t.recentSyncDescription}
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
              {recentRuns.length} {t.entries}
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {recentRuns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
                {t.noSyncRuns}
              </div>
            ) : (
              recentRuns.map((run) => {
                const source = sourceById.get(run.sourceId);

                return (
                  <article
                    key={run.id}
                    className="rounded-[20px] border border-stone-200 bg-stone-50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-stone-900">
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
                        <p className="text-xs uppercase tracking-[0.14em] text-stone-400">
                          {new Date(run.startedAt).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
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

                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
                      <span>{run.insertedItemCount} {t.items}</span>
                      <span>{run.createdBriefCount} {t.briefs}</span>
                      {run.error ? <span>{run.error}</span> : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.84fr_1.16fr]">
        <form
          action={createPresetSource}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t.builtInSources}</h2>
            <p className="text-sm leading-6 text-stone-500">
              {t.builtInDescription}
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.task}</span>
            <select
              name="taskId"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
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

          <div className="grid gap-3">
            {sourcePresets.map((preset) => (
              <article
                key={preset.id}
                className="rounded-[20px] border border-stone-200 bg-stone-50 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-stone-900">
                        {preset.title}
                      </h3>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-500">
                        {preset.sourceType}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-500">
                        {preset.category}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-stone-600">
                      {preset.description}
                    </p>
                    <p className="break-all text-xs text-stone-400">
                      {preset.url}
                    </p>
                  </div>
                  <button
                    type="submit"
                    name="presetId"
                    value={preset.id}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-stone-900 px-3 text-xs font-semibold tracking-wider uppercase text-white transition hover:bg-stone-800"
                    disabled={tasks.length === 0}
                  >
                    {t.add}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </form>

        <form
          action={createSource}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t.addSource}</h2>
            <p className="text-sm leading-6 text-stone-500">
              {t.addSourceDescription}
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.task}</span>
            <select
              name="taskId"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
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

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.sourceType}</span>
            <select
              name="sourceType"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              defaultValue="RSS"
            >
              <option value="RSS">RSS Feed</option>
              <option value="PAGE">Web Page</option>
              <option value="STRUCTURED">Structured List</option>
              <option value="UPDATE">Update Feed</option>
              <option value="NEWSLETTER">Newsletter Archive</option>
              <option value="TELEGRAM_PUBLIC">Telegram Public Feed</option>
              <option value="TELEGRAM_BOT">Telegram Bot Feed</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.sourceTitle}</span>
            <input
              name="title"
              placeholder="OpenAI Blog RSS"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">{t.feedUrl}</span>
            <input
              name="url"
              placeholder="https://example.com/feed.xml"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>
          <p className="text-xs leading-5 text-stone-400">
            {t.telegramHelp}
          </p>

          <button
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#0057ff] px-4 text-sm font-medium text-white transition hover:bg-[#0049d6]"
            disabled={tasks.length === 0}
          >
            {t.saveSource}
          </button>
        </form>

        <section className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)] lg:col-span-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{t.taskSources}</h2>
              <p className="text-sm leading-6 text-stone-500">
                {t.taskSourcesDescription}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {tasks.length > 0 && tasks.some((t) => t.sources.length > 0) && (
                <form action={runSyncAll}>
                  <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-900 px-4 text-xs font-semibold tracking-wider uppercase text-white transition hover:bg-stone-800">
                    {t.syncAll}
                  </button>
                </form>
              )}
              <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
                {t.localDb}
              </span>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
              {t.noTasks}
            </div>
          ) : (
            <div className="grid gap-4">
              {tasks.map((task) => (
                <article
                  key={task.id}
                  className="rounded-[22px] border border-stone-200 bg-stone-50/80 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
                        {t.monitoringGoal}
                      </p>
                      <h3 className="text-lg font-semibold text-stone-950">
                        {task.title}
                      </h3>
                      <p className="max-w-2xl text-sm leading-6 text-stone-600">
                        {task.userPrompt}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500">
                      {task.sources.length} {t.sources}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {task.sources.length === 0 ? (
                      <p className="text-sm text-stone-500">
                        {t.noSourcesForTask}
                      </p>
                    ) : (
                      task.sources.map((source) => (
                        <div
                          key={source.id}
                          className="rounded-2xl bg-white px-4 py-4 shadow-[0_8px_24px_rgba(33,24,9,0.05)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-medium text-stone-950">
                              {source.title}
                            </h4>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                                {source.sourceType}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[source.status]}`}
                              >
                                {statusLabels[source.status]}
                              </span>
                              <form action={runSourceSync}>
                                <input
                                  name="sourceId"
                                  type="hidden"
                                  value={source.id}
                                />
                                <button className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-200 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50">
                                  {t.syncNow}
                                </button>
                              </form>
                              <form action={deleteSource}>
                                <input
                                  name="sourceId"
                                  type="hidden"
                                  value={source.id}
                                />
                                <button className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-200 px-3 text-sm font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50">
                                  {t.delete}
                                </button>
                              </form>
                              <Link
                                href={`/sources/${source.id}`}
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-200 px-3 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
                              >
                                {t.diagnostics}
                              </Link>
                            </div>
                          </div>
                          <p className="mt-2 break-all text-sm leading-6 text-stone-600">
                            {source.url}
                          </p>
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <form
                              action={updateSourceSchedule}
                              className="flex items-center gap-2"
                            >
                              <input
                                name="sourceId"
                                type="hidden"
                                value={source.id}
                              />
                              <select
                                name="syncIntervalMinutes"
                                defaultValue={String(source.syncIntervalMinutes)}
                                className="h-9 rounded-xl border border-stone-200 bg-white px-3 text-xs text-stone-600"
                              >
                                <option value="15">{t.every15Min}</option>
                                <option value="60">{t.every60Min}</option>
                                <option value="360">{t.every6Hr}</option>
                                <option value="1440">{t.daily}</option>
                              </select>
                              <button className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-200 px-3 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50">
                                {t.saveCadence}
                              </button>
                            </form>
                            <span className="text-xs text-stone-500">
                              {t.nextSync}{" "}
                              {source.nextSyncAt
                                ? new Date(source.nextSyncAt).toLocaleString(
                                    "en-US",
                                    {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    },
                                  )
                                : t.notScheduled}
                            </span>
                          </div>
                          <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                              {t.recentRuns}
                            </div>
                            {source.recentRuns.length === 0 ? (
                              <p className="mt-3 text-xs text-stone-500">
                                {t.noRecordedRuns}
                              </p>
                            ) : (
                              <ul className="mt-3 grid gap-2">
                                {source.recentRuns.map((run: SyncRunRecord) => (
                                  <li
                                    key={run.id}
                                    className="flex items-center justify-between gap-3 text-xs text-stone-500"
                                  >
                                    <span className="font-medium text-stone-700">
                                      {run.status}
                                    </span>
                                    <span>
                                      {run.insertedItemCount} {t.items} /{" "}
                                      {run.createdBriefCount} {t.briefs}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
