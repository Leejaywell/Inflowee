import Link from "next/link";
import { redirect } from "next/navigation";

import { createTask, deleteTask } from "@/app/actions";
import { ChatConsole } from "@/components/chat-console";
import { getActorScopedChatScopeId, getSessionUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";
import {
  countUnreadBriefs,
  defaultStore,
  getOrCreateChatThread,
  getSourceHealthSummary,
  listBriefsFiltered,
  listChatMessages,
  listRecentSyncRuns,
  listSources,
  listTasks,
  type TaskType,
} from "@/lib/store";

type HomeProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const [actor, locale] = await Promise.all([
    getSessionUser(),
    getRequestLocale(),
  ]);

  if (!actor) {
    redirect("/login");
  }

  const t = getDictionary(locale).home;
  const chatLabels = getDictionary(locale).chat;
  const taskTypeLabels: Record<TaskType, string> = {
    TOPIC: t.taskTypeTopic,
    QUESTION: t.taskTypeQuestion,
  };
  const actorScopeId = getActorScopedChatScopeId(actor.id, "home");
  const [
    tasks,
    sources,
    briefs,
    unreadCount,
    healthSummary,
    recentRuns,
    params,
    globalThread,
  ] = await Promise.all([
    listTasks(defaultStore, { actorId: actor.id }),
    listSources(defaultStore, { actorId: actor.id }),
    listBriefsFiltered(defaultStore, { actorId: actor.id }),
    countUnreadBriefs(defaultStore, { actorId: actor.id }),
    getSourceHealthSummary(defaultStore, { actorId: actor.id }),
    listRecentSyncRuns(defaultStore, 5, { actorId: actor.id }),
    searchParams,
    getOrCreateChatThread(defaultStore, "global", actorScopeId),
  ]);
  const globalMessages = await listChatMessages(defaultStore, globalThread.id);
  const recentBriefs = briefs.slice(0, 5);

  return (
    <div className="grid gap-5">
      <section className="grid gap-5 rounded-[18px] border border-stone-900/10 bg-white p-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-5">
          <span className="inline-flex rounded-full bg-stone-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-50">
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

        <div className="grid gap-4 rounded-[16px] bg-stone-950 p-5 text-stone-50">
          <div>
            <p className="text-sm uppercase tracking-[0.12em] text-stone-400">
              {t.snapshot}
            </p>
            <p className="mt-3 text-4xl font-semibold">{tasks.length}</p>
            <p className="text-sm text-stone-300">{t.goals}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
            <div>
              <p className="text-2xl font-semibold">{unreadCount}</p>
              <p className="text-stone-300">{t.unreadBriefs}</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{sources.length}</p>
              <p className="text-stone-300">{t.sources}</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{healthSummary.errored}</p>
              <p className="text-stone-300">{t.failing}</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{healthSummary.dueNow}</p>
              <p className="text-stone-300">{t.dueNow}</p>
            </div>
          </div>
        </div>
      </section>

      {params?.error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {decodeURIComponent(params.error)}
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
        <div className="grid gap-6">
          <form
            action={createTask}
            className="grid gap-4 rounded-[18px] border border-stone-900/10 bg-white p-6"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{t.createTitle}</h2>
              <p className="text-sm leading-6 text-stone-500">
                {t.createDescription}
              </p>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">{t.titleLabel}</span>
              <input
                name="title"
                placeholder={t.titlePlaceholder}
                className="h-12 rounded-xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </label>

            <input name="taskType" type="hidden" value="TOPIC" />

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">{t.promptLabel}</span>
              <textarea
                name="userPrompt"
                rows={5}
                placeholder={t.promptPlaceholder}
                className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </label>

            <button className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0057ff] px-4 text-sm font-medium text-white transition hover:bg-[#0049d6]">
              {t.createButton}
            </button>
          </form>

          <ChatConsole
            scopeType="global"
            scopeId="home"
            initialMessages={globalMessages}
            title={t.assistantTitle}
            subtitle={t.assistantSubtitle}
            labels={chatLabels}
          />
        </div>

        <div className="grid gap-6">
          <section className="rounded-[18px] border border-stone-900/10 bg-white p-6">
            <div className="mb-4 flex items-end justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <h2 className="text-xl font-semibold">{t.goalListTitle}</h2>
                <p className="text-sm leading-6 text-stone-500">
                  {t.goalListDescription}
                </p>
              </div>
              <span className="text-xs uppercase tracking-[0.12em] text-stone-400">
                {tasks.length} {t.goalCount}
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
                {t.emptyGoals}
              </div>
            ) : (
              <div className="grid gap-3">
                {tasks.map((task) => (
                  <article
                    key={task.id}
                    className="rounded-2xl border border-stone-200 bg-stone-50/80 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-stone-950 hover:text-[#0057ff]">
                            <Link href={`/tasks/${task.id}`}>{task.title}</Link>
                          </h3>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-600">
                            {taskTypeLabels[task.taskType]}
                          </span>
                        </div>
                        <p className="max-w-2xl text-sm leading-6 text-stone-600">
                          {task.userPrompt}
                        </p>
                      </div>
                      <form action={deleteTask}>
                        <input name="taskId" type="hidden" value={task.id} />
                        <button className="inline-flex h-8 items-center rounded-lg border border-rose-200 px-2.5 text-xs font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50">
                          {t.delete}
                        </button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[18px] border border-stone-900/10 bg-white p-6">
            <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
              <h2 className="text-xl font-semibold">{t.recentBriefs}</h2>
              <Link href="/inbox" className="text-xs font-bold text-[#0057ff] hover:underline">
                {t.openInbox}
              </Link>
            </div>
            {recentBriefs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
                {t.emptyBriefs}
              </div>
            ) : (
              <div className="grid gap-3">
                {recentBriefs.map((brief) => (
                  <Link
                    key={brief.id}
                    href={`/inbox/${brief.id}`}
                    className="rounded-2xl border border-stone-100 bg-stone-50/80 p-4 transition hover:border-stone-200 hover:bg-stone-50"
                  >
                    <div className="text-sm font-semibold text-stone-950">
                      {brief.title}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-stone-600">
                      {brief.summary}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[18px] border border-stone-900/10 bg-white p-6">
            <h2 className="text-xl font-semibold">{t.recentSyncRuns}</h2>
            <div className="mt-4 grid gap-3">
              {recentRuns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
                  {t.emptySyncRuns}
                </div>
              ) : (
                recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-stone-900">
                        {run.status}
                      </span>
                      <span className="text-xs text-stone-500">
                        {new Date(run.startedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {run.insertedItemCount} {t.items}, {run.createdBriefCount}{" "}
                      {t.briefs}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
