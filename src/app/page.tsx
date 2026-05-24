import Link from "next/link";
import { redirect } from "next/navigation";

import { createTopic, deleteTopic } from "@/app/actions";
import { ChatConsole } from "@/components/chat-console";
import {
  MetricPill,
  Notice,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Surface,
} from "@/components/ui-shell";
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
  listTopics,
  type TopicType,
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
  const isZh = locale === "zh";
  const chatLabels = getDictionary(locale).chat;
  const topicTypeLabels: Record<TopicType, string> = {
    TOPIC: t.topicTypeTopic,
    QUESTION: t.topicTypeQuestion,
  };
  const actorScopeId = getActorScopedChatScopeId(actor.id, "home");
  const [
    topics,
    sources,
    briefs,
    unreadCount,
    healthSummary,
    recentRuns,
    params,
    globalThread,
  ] = await Promise.all([
    listTopics(defaultStore, { actorId: actor.id }),
    listSources(defaultStore, { actorId: actor.id }),
    listBriefsFiltered(defaultStore, { actorId: actor.id }),
    countUnreadBriefs(defaultStore, { actorId: actor.id }),
    getSourceHealthSummary(defaultStore, { actorId: actor.id }),
    listRecentSyncRuns(defaultStore, 6, { actorId: actor.id }),
    searchParams,
    getOrCreateChatThread(defaultStore, "global", actorScopeId),
  ]);
  const globalMessages = await listChatMessages(defaultStore, globalThread.id);
  const recentBriefs = briefs.slice(0, 6);

  const sourceCountByTopic = new Map<string, number>();
  for (const source of sources) {
    sourceCountByTopic.set(source.topicId, (sourceCountByTopic.get(source.topicId) ?? 0) + 1);
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow={t.badge}
        title={t.title}
        description={t.description}
        actions={
          <>
            <SecondaryButton href="/discover">
              {isZh ? "发现来源" : "Discover sources"}
            </SecondaryButton>
            <PrimaryButton href="/sources">
              {isZh ? "管理来源" : "Manage sources"}
            </PrimaryButton>
          </>
        }
        metrics={
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MetricPill value={topics.length} label={t.topicsLabel} />
            <MetricPill
              value={unreadCount}
              label={t.unreadBriefs}
              tone={unreadCount > 0 ? "accent" : "default"}
            />
            <MetricPill value={sources.length} label={t.sources} />
            <MetricPill
              value={healthSummary.errored}
              label={t.failing}
              tone={healthSummary.errored > 0 ? "danger" : "default"}
            />
            <MetricPill
              value={healthSummary.dueNow}
              label={t.dueNow}
              tone={healthSummary.dueNow > 0 ? "warning" : "default"}
            />
          </div>
        }
      />

      {params?.error ? (
        <Notice tone="danger">
          {decodeURIComponent(params.error)}
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left column: Topics + create form */}
        <Surface>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{t.topicListTitle}</h2>
              <p className="text-sm leading-6 text-stone-500">{t.topicListDescription}</p>
            </div>
            <span className="text-xs uppercase tracking-[0.12em] text-stone-400">
              {topics.length} {t.topicCount}
            </span>
          </div>

          {topics.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
              {t.emptyTopics}
            </div>
          ) : (
            <div className="grid gap-3">
              {topics.map((topic) => (
                <article
                  key={topic.id}
                  className="rounded-2xl border border-stone-200 bg-stone-50/80 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-600">
                          {topicTypeLabels[topic.topicType]}
                        </span>
                        {(sourceCountByTopic.get(topic.id) ?? 0) > 0 && (
                          <span className="text-xs text-stone-400">
                            {sourceCountByTopic.get(topic.id)}{" "}
                            {isZh ? "个来源" : "sources"}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-stone-950 hover:text-[#0057ff]">
                        <Link href={`/topics/${topic.id}`}>{topic.title}</Link>
                      </h3>
                      <p className="line-clamp-2 text-sm leading-6 text-stone-600">
                        {topic.userPrompt}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Link
                        href={`/topics/${topic.id}`}
                        className="inline-flex h-8 items-center rounded-lg bg-[#0057ff] px-3 text-xs font-semibold text-white transition hover:bg-[#0049d6]"
                      >
                        {isZh ? "查看" : "View"}
                      </Link>
                      <form action={deleteTopic}>
                        <input name="topicId" type="hidden" value={topic.id} />
                        <button className="inline-flex h-8 items-center rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50">
                          {t.delete}
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-stone-100 pt-5">
            <form action={createTopic} className="grid gap-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-stone-800">{t.createTitle}</h3>
                <p className="text-xs leading-5 text-stone-500">{t.createDescription}</p>
              </div>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-stone-700">{t.titleLabel}</span>
                <input
                  name="title"
                  placeholder={t.titlePlaceholder}
                  className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </label>
              <input name="topicType" type="hidden" value="TOPIC" />
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-stone-700">{t.promptLabel}</span>
                <textarea
                  name="userPrompt"
                  rows={3}
                  placeholder={t.promptPlaceholder}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </label>
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0057ff] px-4 text-sm font-medium text-white transition hover:bg-[#0049d6]">
                {t.createButton}
              </button>
            </form>
          </div>
        </Surface>

        {/* Right column: Briefs + Activity + Chat */}
        <div className="grid content-start gap-5">
          {/* Recent briefs */}
          <Surface>
            <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <h2 className="text-xl font-semibold">{t.recentBriefs}</h2>
                {unreadCount > 0 && (
                  <p className="text-sm text-[#0057ff]">
                    {unreadCount} {t.unreadBriefs}
                  </p>
                )}
              </div>
              <Link
                href="/inbox"
                className="text-xs font-bold text-[#0057ff] hover:underline"
              >
                {t.openInbox}
              </Link>
            </div>
            {recentBriefs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
                {t.emptyBriefs}
              </div>
            ) : (
              <div className="grid gap-2">
                {recentBriefs.map((brief) => (
                  <Link
                    key={brief.id}
                    href={`/inbox/${brief.id}`}
                    className={`rounded-2xl border p-4 transition hover:bg-stone-50 ${
                      !brief.isRead
                        ? "border-stone-200 bg-stone-50/80"
                        : "border-stone-100 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!brief.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0057ff]" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-stone-400">
                          {brief.topicTitle}
                        </p>
                        <div className="mt-0.5 text-sm font-semibold text-stone-950">
                          {brief.title}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">
                          {brief.summary}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Surface>

          {/* Sync activity */}
          <Surface>
            <h2 className="mb-4 text-base font-semibold text-stone-950">
              {t.recentSyncRuns}
            </h2>
            {recentRuns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-6 text-sm text-stone-500">
                {t.emptySyncRuns}
              </div>
            ) : (
              <div className="grid gap-2">
                {recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          run.status === "success"
                            ? "bg-emerald-500"
                            : run.status === "error"
                              ? "bg-rose-500"
                              : "bg-stone-300"
                        }`}
                      />
                      <span className="truncate text-xs text-stone-600">
                        {new Date(run.startedAt).toLocaleString()}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-stone-400">
                      {run.insertedItemCount} {t.items} · {run.createdBriefCount}{" "}
                      {t.briefs}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Surface>

          {/* AI assistant */}
          <ChatConsole
            scopeType="global"
            scopeId="home"
            initialMessages={globalMessages}
            title={t.assistantTitle}
            subtitle={t.assistantSubtitle}
            labels={chatLabels}
          />
        </div>
      </div>
    </div>
  );
}
