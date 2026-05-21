import { createSource, deleteSource, runSourceSync, runSyncAll } from "@/app/actions";
import {
  defaultStore,
  listSources,
  listSpacesWithTasks,
  type SourceStatus,
} from "@/lib/store";

type SourcesPageProps = {
  searchParams?: Promise<{
    created?: string;
    error?: string;
    synced?: string;
  }>;
};

const statusLabels: Record<SourceStatus, string> = {
  idle: "Idle",
  success: "Healthy",
  error: "Error",
};

const statusClasses: Record<SourceStatus, string> = {
  idle: "bg-stone-100 text-stone-600",
  success: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
};

export default async function SourcesPage({ searchParams }: SourcesPageProps) {
  const [spaces, sources, params] = await Promise.all([
    Promise.resolve(listSpacesWithTasks(defaultStore)),
    Promise.resolve(listSources(defaultStore)),
    searchParams,
  ]);
  const sourcesByTask = new Map<string, typeof sources>();

  for (const source of sources) {
    const taskSources = sourcesByTask.get(source.taskId) ?? [];
    taskSources.push(source);
    sourcesByTask.set(source.taskId, taskSources);
  }

  const tasks = spaces.flatMap((space) =>
    space.tasks.map((task) => ({
      ...task,
      spaceName: space.name,
      sources: sourcesByTask.get(task.id) ?? [],
    })),
  );
  const created = params?.created;
  const error = params?.error;
  const synced = params?.synced;

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <span className="inline-flex rounded-full bg-[#0057ff] px-3 py-1 text-xs font-medium tracking-[0.18em] text-white uppercase">
            Source management
          </span>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Attach RSS sources to the tasks already defined.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
              This slice only handles source creation and visibility. Pick a
              task, attach a feed, and confirm it persists in the local
              database.
            </p>
          </div>
        </div>

        <div className="grid gap-4 rounded-[22px] bg-stone-950 p-5 text-stone-50">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-stone-400">
              Snapshot
            </p>
            <p className="mt-3 text-4xl font-semibold">{tasks.length}</p>
            <p className="text-sm text-stone-300">tasks available for feeds</p>
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="text-4xl font-semibold">
              {tasks.reduce((count, task) => count + task.sources.length, 0)}
            </p>
            <p className="text-sm text-stone-300">RSS sources connected</p>
          </div>
        </div>
      </section>

      {(created || error || synced) && (
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
              ? "Source created."
              : synced === "source"
                ? "Source synced."
                : synced === "all"
                  ? "All non-error sources synced."
                  : "Update applied."}
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[0.84fr_1.16fr]">
        <form
          action={createSource}
          className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Add a source</h2>
            <p className="text-sm leading-6 text-stone-500">
              Attach an RSS feed or web page to a task.
            </p>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Task</span>
            <select
              name="taskId"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              defaultValue=""
            >
              <option value="" disabled>
                Select a task
              </option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.spaceName} / {task.title}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Source type</span>
            <select
              name="sourceType"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              defaultValue="RSS"
            >
              <option value="RSS">RSS Feed</option>
              <option value="PAGE">Web Page</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Source title</span>
            <input
              name="title"
              placeholder="OpenAI Blog RSS"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-stone-700">Feed URL</span>
            <input
              name="url"
              placeholder="https://example.com/feed.xml"
              className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>

          <button
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#0057ff] px-4 text-sm font-medium text-white transition hover:bg-[#0049d6]"
            disabled={tasks.length === 0}
          >
            Save source
          </button>
        </form>

        <section className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Task sources</h2>
              <p className="text-sm leading-6 text-stone-500">
                RSS sources currently attached to each task.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {tasks.length > 0 && tasks.some((t) => t.sources.length > 0) && (
                <form action={runSyncAll}>
                  <button className="inline-flex h-9 items-center justify-center rounded-xl bg-stone-900 px-4 text-xs font-semibold tracking-wider uppercase text-white transition hover:bg-stone-800">
                    Sync all
                  </button>
                </form>
              )}
              <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
                Local DB
              </span>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
              No tasks yet. Create tasks on the home page before adding
              sources.
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
                        {task.spaceName}
                      </p>
                      <h3 className="text-lg font-semibold text-stone-950">
                        {task.title}
                      </h3>
                      <p className="max-w-2xl text-sm leading-6 text-stone-600">
                        {task.userPrompt}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500">
                      {task.sources.length} sources
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {task.sources.length === 0 ? (
                      <p className="text-sm text-stone-500">
                        No sources linked to this task yet.
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
                                  Sync now
                                </button>
                              </form>
                              <form action={deleteSource}>
                                <input
                                  name="sourceId"
                                  type="hidden"
                                  value={source.id}
                                />
                                <button className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-200 px-3 text-sm font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50">
                                  Delete
                                </button>
                              </form>
                            </div>
                          </div>
                          <p className="mt-2 break-all text-sm leading-6 text-stone-600">
                            {source.url}
                          </p>
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
