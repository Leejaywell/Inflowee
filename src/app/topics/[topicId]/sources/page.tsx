import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteTopicSourceAction } from "@/app/actions";
import { SubscriptionDiscovery } from "@/components/subscription-discovery";
import { PageHeader } from "@/components/ui-shell";
import { assertTopicAccess, requireSessionActor } from "@/lib/auth";
import { buildTopicDiscoveryExperience } from "@/lib/discovery-runtime";
import { getRequestLocale } from "@/lib/i18n-server";
import { defaultStore, getTopicById, listSourcesByTopic, listTopics } from "@/lib/store";

export const dynamic = "force-dynamic";

type TopicSourcesPageProps = {
  params: Promise<{ topicId: string }>;
};

export default async function TopicSourcesPage({ params }: TopicSourcesPageProps) {
  const { topicId } = await params;
  const [actor, locale] = await Promise.all([requireSessionActor(), getRequestLocale()]);
  const isZh = locale === "zh";
  const store = defaultStore;
  const topic = await getTopicById(store, topicId);

  if (!topic) {
    notFound();
  }

  try {
    await assertTopicAccess(store, { actorId: actor.id, topicId });
  } catch {
    notFound();
  }

  const [sources, discoveryExperience, allTopics] = await Promise.all([
    listSourcesByTopic(store, topicId),
    buildTopicDiscoveryExperience(store, topic),
    listTopics(store, { actorId: actor.id }),
  ]);

  const statusClasses: Record<string, string> = {
    idle: "bg-stone-100 text-stone-600",
    success: "bg-emerald-100 text-emerald-700",
    error: "bg-rose-100 text-rose-700",
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow={topic.title}
        title={isZh ? "来源管理" : "Sources"}
        description={
          isZh
            ? "管理这个话题订阅的来源，或通过 AI 发现更多来源。"
            : "Manage subscribed sources for this topic, or discover more with AI."
        }
        actions={
          <Link
            href={`/topics/${topicId}`}
            className="inline-flex h-9 items-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            {isZh ? "← 返回话题" : "← Back to topic"}
          </Link>
        }
      />

      {/* Current sources */}
      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
          <h2 className="text-lg font-semibold text-stone-950">
            {isZh ? "已订阅来源" : "Subscribed sources"}
          </h2>
          <span className="text-xs uppercase tracking-[0.14em] text-stone-400">
            {sources.length} {isZh ? "个" : "total"}
          </span>
        </div>

        {sources.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
            {isZh ? "还没有来源。在下方发现并添加来源。" : "No sources yet. Discover and add sources below."}
          </div>
        ) : (
          <div className="grid gap-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="rounded-2xl border border-stone-100 bg-stone-50/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-stone-900">
                        {source.title}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses[source.status] ?? "bg-stone-100 text-stone-600"}`}
                      >
                        {source.status}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-stone-500">
                        {source.sourceType}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-stone-500">{source.url}</p>
                    {source.lastSyncedAt && (
                      <p className="mt-1 text-xs text-stone-400">
                        {isZh ? "最近同步：" : "Last synced: "}
                        {new Date(source.lastSyncedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <form action={deleteTopicSourceAction}>
                    <input type="hidden" name="sourceId" value={source.id} />
                    <input type="hidden" name="topicId" value={topicId} />
                    <button className="inline-flex h-8 items-center justify-center rounded-xl border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50">
                      {isZh ? "移除" : "Remove"}
                    </button>
                  </form>
                </div>
                {source.lastError && (
                  <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {source.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Discovery */}
      <SubscriptionDiscovery
        topicId={topicId}
        topicOptions={allTopics.map((t) => ({ id: t.id, title: t.title }))}
        categories={discoveryExperience.categories}
        tags={discoveryExperience.tags}
        candidates={discoveryExperience.candidates}
        isZh={isZh}
      />
    </div>
  );
}
