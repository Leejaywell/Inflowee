import Link from "next/link";
import { notFound } from "next/navigation";

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
  listSourcesByTask,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type TaskDetailPageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { taskId } = await params;
  const store = defaultStore;
  const actor = await requireSessionActor();
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

  const [activeSources, recommendedBundles, recentBriefs] = await Promise.all([
    listSourcesByTask(store, taskId),
    listRecommendationBundlesByTask(store, taskId),
    listBriefsFiltered(store, { actorId: actor.id, taskId }),
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
              Dashboard
            </Link>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
              Monitoring goal
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-stone-950 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-50">
                {task.taskType}
              </span>
              <span className="rounded-full bg-[#0057ff]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0057ff]">
                Level {task.relevanceLevel}
              </span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
              {task.title}
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-stone-600">
              <strong className="text-stone-800">Monitoring goal:</strong>{" "}
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
          />

          <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
              <h2 className="text-lg font-semibold text-stone-950">
                Subscribed sources
              </h2>
              <Link href="/sources" className="text-xs font-bold text-[#0057ff] hover:underline">
                Advanced source manager
              </Link>
            </div>

            {activeSources.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
                No sources are subscribed yet. Choose a recommended subscription
                package above or add a custom source.
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
                Recent briefs
              </h2>
              <Link href={`/inbox?taskId=${taskId}`} className="text-xs font-bold text-[#0057ff] hover:underline">
                Open inbox
              </Link>
            </div>

            {recentBriefs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
                No briefs yet. Subscribe and sync sources to generate the first
                monitoring results.
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
        </div>

        <ChatConsole
          scopeType="task"
          scopeId={taskId}
          initialMessages={chatMessages}
          title={`${task.title} Assistant`}
          subtitle="Answers grounded in stored briefs and raw items for this monitoring goal."
        />
      </div>
    </div>
  );
}

