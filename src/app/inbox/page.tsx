import Link from "next/link";

import { deleteBrief, toggleBriefRead } from "@/app/actions";
import { requireSessionActor } from "@/lib/auth";
import {
  defaultStore,
  listBriefsFiltered,
  listSpacesWithTasks,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type InboxPageProps = {
  searchParams?: Promise<{
    taskId?: string;
    unread?: string;
  }>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const actor = await requireSessionActor();
  const params = await searchParams;
  const taskId = params?.taskId || undefined;
  const unreadOnly = params?.unread === "1";

  const [briefs, spaces] = await Promise.all([
    listBriefsFiltered(defaultStore, { actorId: actor.id, taskId, unreadOnly }),
    listSpacesWithTasks(defaultStore, { actorId: actor.id }),
  ]);
  const tasks = spaces.flatMap((space) =>
    space.tasks.map((task) => ({
      id: task.id,
      label: `${space.name} / ${task.title}`,
    })),
  );

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <div className="space-y-3">
          <span className="inline-flex rounded-full bg-[#0057ff] px-3 py-1 text-xs font-medium tracking-[0.18em] text-white uppercase">
            Brief inbox
          </span>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Brief inbox
            </h1>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
              AI-ready brief objects rendered from stored feed items.
            </p>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section className="flex flex-wrap items-center gap-3 rounded-[20px] border border-stone-900/10 bg-white px-5 py-3 shadow-[0_8px_24px_rgba(33,24,9,0.04)]">
        <span className="text-sm font-medium text-stone-500">Filter:</span>

        <Link
          href="/inbox"
          className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition ${
            !taskId && !unreadOnly
              ? "bg-stone-950 text-white"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
        >
          All
        </Link>

        <Link
          href={taskId ? `/inbox?taskId=${taskId}&unread=1` : "/inbox?unread=1"}
          className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition ${
            unreadOnly
              ? "bg-[#0057ff] text-white"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
        >
          Unread only
        </Link>

        <span className="mx-1 h-5 w-px bg-stone-200" />

        {tasks.map((task) => (
          <Link
            key={task.id}
            href={
              unreadOnly
                ? `/inbox?taskId=${task.id}&unread=1`
                : `/inbox?taskId=${task.id}`
            }
            className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition ${
              taskId === task.id
                ? "bg-stone-950 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {task.label}
          </Link>
        ))}

        <span className="ml-auto text-sm text-stone-400">
          {briefs.length} brief{briefs.length !== 1 ? "s" : ""}
        </span>
      </section>

      {briefs.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-stone-200 bg-white px-6 py-10 text-sm text-stone-500 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          {taskId || unreadOnly
            ? "No briefs match the current filters."
            : "No briefs yet. Sync a source from the Sources page."}
        </section>
      ) : (
        <section className="grid gap-4">
          {briefs.map((brief) => (
            <article
              key={brief.id}
              className={`rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)] transition ${
                brief.isRead ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {/* Unread dot */}
                  {!brief.isRead && (
                    <span className="mt-2.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[#0057ff]" />
                  )}
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
                      {brief.spaceName} / {brief.taskTitle}
                    </p>
                    <h2 className="text-2xl font-semibold text-stone-950">
                      <Link
                        href={`/inbox/${brief.id}`}
                        className="transition hover:text-[#0057ff]"
                      >
                        {brief.title}
                      </Link>
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <form action={toggleBriefRead}>
                    <input name="briefId" type="hidden" value={brief.id} />
                    <input
                      name="isRead"
                      type="hidden"
                      value={brief.isRead ? "1" : "0"}
                    />
                    <button className="inline-flex h-9 items-center rounded-xl border border-stone-200 px-3 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50">
                      {brief.isRead ? "Mark unread" : "Mark read"}
                    </button>
                  </form>

                  <Link
                    href={`/inbox/${brief.id}/html`}
                    className="inline-flex h-9 items-center rounded-xl bg-stone-950 px-3 text-xs font-medium text-white transition hover:bg-stone-800"
                  >
                    HTML
                  </Link>

                  <form action={deleteBrief}>
                    <input name="briefId" type="hidden" value={brief.id} />
                    <button className="inline-flex h-9 items-center rounded-xl border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50">
                      Delete
                    </button>
                  </form>
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-stone-700">
                {brief.summary}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
                  {brief.importanceScore >= 0.75 ? "Important" : "Signal"}
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-500">
                  Relevance {Math.round(brief.relevanceScore * 100)}%
                </span>
                {brief.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-stone-200 px-2.5 py-1 text-[11px] text-stone-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-4 rounded-[20px] bg-stone-50 px-4 py-4">
                <div className="text-sm font-medium text-stone-950">
                  Why it matters
                </div>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {brief.whyItMatters}
                </p>
              </div>

              <ul className="mt-4 grid gap-2 text-sm text-stone-500">
                {brief.sourceCitations.map((citation) => (
                  <li key={citation}>
                    <a
                      href={citation}
                      className="underline decoration-stone-300 underline-offset-4"
                    >
                      {citation}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
