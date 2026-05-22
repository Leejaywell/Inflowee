import Link from "next/link";
import { notFound } from "next/navigation";

import { TaskControls } from "@/components/task-controls";
import { RecommendationWizard } from "@/components/recommendation-wizard";
import { ChatConsole } from "@/components/chat-console";
import {
  defaultStore,
  findChatThread,
  getSpaceById,
  getTaskById,
  listRecommendationBundlesByTask,
  listChatMessages,
  listSourcesByTask,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type TaskDetailPageProps = {
  params: Promise<{ spaceId: string; taskId: string }>;
};

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { spaceId, taskId } = await params;
  const store = defaultStore;

  // 1. Fetch task details
  const task = getTaskById(store, taskId);
  if (!task || task.spaceId !== spaceId) {
    notFound();
  }

  // 2. Fetch space info for breadcrumbs
  const space = getSpaceById(store, spaceId);

  if (!space) {
    notFound();
  }

  // 3. Fetch connected sources list
  const activeSources = listSourcesByTask(store, taskId);

  // 4. Read stored task intelligence
  const recommendedBundles = listRecommendationBundlesByTask(store, taskId);
  const recommendationStateKey = JSON.stringify({
    taskProfile: task.taskProfile ?? null,
    recommendedBundles,
  });

  // 5. Fetch grounded thread history
  const chatThread = findChatThread(store, "task", taskId);
  const chatMessages = chatThread ? listChatMessages(store, chatThread.id) : [];

  return (
    <div className="grid gap-6">
      {/* Header section */}
      <section className="rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Link href="/" className="hover:text-stone-700">
              Dashboard
            </Link>
            <span className="text-stone-300">/</span>
            <Link href={`/spaces/${spaceId}`} className="hover:text-stone-700">
              {space.name}
            </Link>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
              Task details
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-stone-950 px-2.5 py-0.5 text-[10px] font-medium tracking-[0.12em] text-stone-50 uppercase">
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
              <strong className="text-stone-800">Task prompt:</strong> {task.userPrompt}
            </p>
          </div>
        </div>
      </section>

      {/* Main split grid */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left column: Controls, recommendations, active sources */}
        <div className="space-y-6">
          {/* Controls */}
          <TaskControls
            taskId={taskId}
            initialRelevanceLevel={task.relevanceLevel}
            initialSummaryPreference={task.summaryPreference}
          />

          {/* AI Recommendation Wizard */}
          <RecommendationWizard
            key={recommendationStateKey}
            taskId={taskId}
            taskProfile={task.taskProfile ?? null}
            recommendedBundles={recommendedBundles}
          />

          {/* Active Synced Sources */}
          <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h3 className="text-lg font-semibold text-stone-950">Active feed sources</h3>
              <Link
                href="/sources"
                className="text-xs font-bold text-[#0057ff] hover:underline"
              >
                Manage sources →
              </Link>
            </div>

            {activeSources.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-505">
                No active sources subscribed to this task yet. Use the AI recommendation wizard above or add sources manually in the Sources tab.
              </div>
            ) : (
              <div className="space-y-3">
                {activeSources.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-stone-100 bg-stone-50/50 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900 truncate">
                          {src.title}
                        </span>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[8px] font-semibold text-stone-500 uppercase">
                          {src.sourceType}
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-400 truncate block mt-0.5">
                        {src.url}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          src.status === "success"
                            ? "bg-emerald-100 text-emerald-700"
                            : src.status === "error"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-stone-200 text-stone-600"
                        }`}
                      >
                        {src.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Grounded Chat console */}
        <div>
          <ChatConsole
            scopeType="task"
            scopeId={taskId}
            initialMessages={chatMessages}
            title={`${task.title} Assistant`}
            subtitle={`Answers grounded in stored briefs and raw items for this task. Any temporary live context is labeled explicitly.`}
          />
        </div>
      </div>
    </div>
  );
}
