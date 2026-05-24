import Link from "next/link";
import { notFound } from "next/navigation";

import { generateReportAction } from "@/app/actions";
import { TaskControls } from "@/components/task-controls";
import { RecommendationWizard } from "@/components/recommendation-wizard";
import { ChatConsole } from "@/components/chat-console";
import {
  assertTaskAccess,
  getActorScopedChatScopeId,
  requireSessionActor,
} from "@/lib/auth";
import {
  defaultStore,
  findChatThread,
  getTaskById,
  listBriefsFiltered,
  listChatMessages,
  listRecommendationBundlesByTask,
  listReportsByTask,
  listSourcesByTask,
} from "@/lib/store";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

type TaskDetailPageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params;
  const store = defaultStore;
  const [actor, locale] = await Promise.all([
    requireSessionActor(),
    getRequestLocale(),
  ]);
  const dict = getDictionary(locale);
  const t = dict.task;
  const task = await getTaskById(store, taskId);

  if (!task) {
    notFound();
  }

  try {
    await assertTaskAccess(store, {
      actorId: actor.id,
      taskId,
    });
  } catch {
    notFound();
  }

  const [activeSources, recommendedBundles, recentBriefs, reports] = await Promise.all([
    listSourcesByTask(store, taskId),
    listRecommendationBundlesByTask(store, taskId),
    listBriefsFiltered(store, { actorId: actor.id, taskId }),
    listReportsByTask(store, taskId),
  ]);
  const recommendationStateKey = JSON.stringify({
    taskProfile: task.taskProfile ?? null,
    recommendedBundles,
  });
  const actorScopeId = getActorScopedChatScopeId(actor.id, taskId);
  const chatThread = await findChatThread(store, "task", actorScopeId);
  const chatMessages = chatThread
    ? await listChatMessages(store, chatThread.id)
    : [];

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Link href="/" className="hover:text-stone-700">
              {t.dashboard}
            </Link>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
              {t.badge}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-stone-950 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-50">
                {task.taskType}
              </span>
              <span className="rounded-full bg-[#0057ff]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0057ff]">
                {t.level} {task.relevanceLevel}
              </span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
              {task.title}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-stone-600">
              <strong className="text-stone-800">{t.monitoringGoal}</strong>{" "}
              {task.userPrompt}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <TaskControls
            taskId={taskId}
            initialRelevanceLevel={task.relevanceLevel}
            initialSummaryPreference={task.summaryPreference}
          />

          <RecommendationWizard
            key={recommendationStateKey}
            taskId={taskId}
            taskProfile={task.taskProfile ?? null}
            recommendedBundles={recommendedBundles}
            labels={dict.recommendation}
          />

          <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
              <h2 className="text-lg font-semibold text-stone-950">
                {t.subscribedSources}
              </h2>
              <Link href="/sources" className="text-xs font-bold text-[#0057ff] hover:underline">
                {t.advancedSourceManager}
              </Link>
            </div>

            {activeSources.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
                {t.emptySources}
              </div>
            ) : (
              <div className="grid gap-3">
                {activeSources.map((source) => (
                  <article
                    key={source.id}
                    className="rounded-xl border border-stone-100 bg-stone-50/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-stone-900">
                          {source.title}
                        </div>
                        <div className="mt-1 truncate text-xs text-stone-500">
                          {source.url}
                        </div>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-stone-500">
                        {source.status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
              <h2 className="text-lg font-semibold text-stone-950">
                {t.recentBriefs}
              </h2>
              <Link href={`/inbox?taskId=${taskId}`} className="text-xs font-bold text-[#0057ff] hover:underline">
                {t.openInbox}
              </Link>
            </div>

            {recentBriefs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
                {t.emptyBriefs}
              </div>
            ) : (
              <div className="grid gap-3">
                {recentBriefs.slice(0, 5).map((brief) => (
                  <Link
                    key={brief.id}
                    href={`/inbox/${brief.id}`}
                    className="rounded-xl border border-stone-100 bg-stone-50/70 p-4 transition hover:border-stone-200 hover:bg-stone-50"
                  >
                    <div className="text-sm font-semibold text-stone-900">
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

          <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-stone-950">
                  Trend reports
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Generate a time-window analysis from stored briefs and items.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["current", "daily", "incremental"] as const).map((mode) => (
                  <form key={mode} action={generateReportAction}>
                    <input name="taskId" type="hidden" value={taskId} />
                    <input name="mode" type="hidden" value={mode} />
                    <button className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-200 px-3 text-xs font-semibold uppercase text-stone-700 transition hover:bg-stone-50">
                      {mode}
                    </button>
                  </form>
                ))}
              </div>
            </div>

            {reports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
                No reports yet. Generate a current report after syncing sources.
              </div>
            ) : (
              <div className="grid gap-3">
                {reports.slice(0, 3).map((report) => (
                  <article
                    key={report.id}
                    className="rounded-xl border border-stone-100 bg-stone-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-stone-900">
                          {report.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-stone-600">
                          {report.summary}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-stone-500">
                        {report.mode}
                      </span>
                    </div>
                    <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs leading-5 text-stone-600">
                      {report.markdown}
                    </pre>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <ChatConsole
          scopeType="task"
          scopeId={taskId}
          initialMessages={chatMessages}
          title={`${task.title} ${t.assistantSuffix}`}
          subtitle={t.assistantSubtitle}
          labels={dict.chat}
        />
      </div>
    </div>
  );
}
