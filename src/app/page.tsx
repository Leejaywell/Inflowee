import { createSpace, createTask } from "@/app/actions";
import { listSpacesWithTasks, type TaskType } from "@/lib/store";

type HomeProps = {
  searchParams?: Promise<{
    created?: string;
    error?: string;
  }>;
};

const taskTypeLabels: Record<TaskType, string> = {
  TOPIC: "Topic tracking",
  QUESTION: "Question tracking",
};

export default async function Home({ searchParams }: HomeProps) {
  const [spaces, params] = await Promise.all([
    Promise.resolve(listSpacesWithTasks()),
    searchParams,
  ]);

  const created = params?.created;
  const error = params?.error;
  const taskCount = spaces.reduce((count, space) => count + space.tasks.length, 0);

  return (
    <div className="grid gap-8">
        <section className="grid gap-6 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-5">
            <span className="inline-flex rounded-full bg-stone-950 px-3 py-1 text-xs font-medium tracking-[0.18em] text-stone-50 uppercase">
              Inflowee slice 1
            </span>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Build the first intelligence spaces before the feed exists.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
                This first vertical slice only proves the core planning surface:
                create spaces, add topic or question tasks, and persist them in
                a local development database.
              </p>
            </div>
          </div>

          <div className="grid gap-4 rounded-[22px] bg-stone-950 p-5 text-stone-50">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-stone-400">
                Snapshot
              </p>
              <p className="mt-3 text-4xl font-semibold">{spaces.length}</p>
              <p className="text-sm text-stone-300">spaces created</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-4xl font-semibold">{taskCount}</p>
              <p className="text-sm text-stone-300">tasks linked to spaces</p>
            </div>
          </div>
        </section>

        {(created || error) && (
          <section
            className={`rounded-2xl border px-5 py-4 text-sm ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error
              ? decodeURIComponent(error)
              : created === "space"
                ? "Space created."
                : "Task created."}
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="grid gap-6">
            <form
              action={createSpace}
              className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Create a space</h2>
                <p className="text-sm leading-6 text-stone-500">
                  A long-lived intelligence context such as AI Coding Agents or
                  OpenAI Monitor.
                </p>
              </div>

              <label className="grid gap-2 text-sm">
                <span className="font-medium text-stone-700">Name</span>
                <input
                  name="name"
                  placeholder="AI Coding Agents"
                  className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium text-stone-700">Description</span>
                <textarea
                  name="description"
                  rows={4}
                  placeholder="Track products, launches, open-source repos, and hiring signals."
                  className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </label>

              <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-stone-50 transition hover:bg-stone-800">
                Save space
              </button>
            </form>

            <form
              action={createTask}
              className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Add a task</h2>
                <p className="text-sm leading-6 text-stone-500">
                  Tasks are the first future feed drivers. Keep them topic-based
                  or question-driven.
                </p>
              </div>

              <label className="grid gap-2 text-sm">
                <span className="font-medium text-stone-700">Space</span>
                <select
                  name="spaceId"
                  className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a space
                  </option>
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-stone-700">Title</span>
                  <input
                    name="title"
                    placeholder="Agent product moves"
                    className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-stone-700">Type</span>
                  <select
                    name="taskType"
                    className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
                    defaultValue="TOPIC"
                  >
                    <option value="TOPIC">Topic</option>
                    <option value="QUESTION">Question</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm">
                <span className="font-medium text-stone-700">Prompt</span>
                <textarea
                  name="userPrompt"
                  rows={5}
                  placeholder="Track launches, hiring, and product signals from AI coding agent companies."
                  className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </label>

              <button
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#0057ff] px-4 text-sm font-medium text-white transition hover:bg-[#0049d6]"
                disabled={spaces.length === 0}
              >
                Save task
              </button>
            </form>
          </div>

          <section className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Current structure</h2>
                <p className="text-sm leading-6 text-stone-500">
                  Spaces and tasks persisted by this slice.
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.16em] text-stone-400">
                Local DB
              </span>
            </div>

            {spaces.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
                No spaces yet. Create one on the left, then attach the first
                task.
              </div>
            ) : (
              <div className="grid gap-4">
                {spaces.map((space) => (
                  <article
                    key={space.id}
                    className="rounded-[22px] border border-stone-200 bg-stone-50/80 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-stone-950">
                          {space.name}
                        </h3>
                        <p className="max-w-2xl text-sm leading-6 text-stone-600">
                          {space.description || "No description yet."}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500">
                        {space.tasks.length} tasks
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {space.tasks.length === 0 ? (
                        <p className="text-sm text-stone-500">
                          No tasks inside this space yet.
                        </p>
                      ) : (
                        space.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="rounded-2xl bg-white px-4 py-4 shadow-[0_8px_24px_rgba(33,24,9,0.05)]"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-medium text-stone-950">
                                {task.title}
                              </h4>
                              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                                {taskTypeLabels[task.taskType]}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-stone-600">
                              {task.userPrompt}
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
