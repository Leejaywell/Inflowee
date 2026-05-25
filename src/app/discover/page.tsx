import Link from "next/link";
import { redirect } from "next/navigation";

import { SubscriptionDiscovery } from "@/components/subscription-discovery";
import { PageHeader, SecondaryButton, Surface } from "@/components/ui-shell";
import { getSessionUser } from "@/lib/auth";
import {
  buildGenericDiscoveryExperience,
  buildTopicDiscoveryExperience,
} from "@/lib/discovery-runtime";
import { getRequestLocale } from "@/lib/i18n-server";
import { defaultStore, listSources, listTopics } from "@/lib/store";

type DiscoverPageProps = {
  searchParams?: Promise<{
    topicId?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const [actor, locale, params] = await Promise.all([
    getSessionUser(),
    getRequestLocale(),
    searchParams,
  ]);

  if (!actor) {
    redirect("/login");
  }

  const [topics, customSources] = await Promise.all([
    listTopics(defaultStore, { actorId: actor.id }),
    listSources(defaultStore, { actorId: actor.id }),
  ]);
  const selectedTopic = params?.topicId
    ? topics.find((topic) => topic.id === params.topicId) ?? null
    : null;
  const experience = selectedTopic
    ? await buildTopicDiscoveryExperience(defaultStore, selectedTopic)
    : buildGenericDiscoveryExperience(customSources);
  const isZh = locale === "zh";

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow={isZh ? "发现" : "Discover"}
        title={isZh ? "探寻值得关注的信号源" : "Find signals worth following"}
        actions={
          <SecondaryButton href="/sources">
            {isZh ? "自定义来源" : "Custom sources"}
          </SecondaryButton>
        }
      />

      {topics.length > 0 ? (
        <Surface padded="sm">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/discover"
              className={`inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold transition ${
                selectedTopic
                  ? "border-stone-200 bg-stone-50 text-stone-700 hover:bg-white"
                  : "border-[#0057ff] bg-[#0057ff] text-white"
              }`}
            >
              {isZh ? "全部" : "All"}
            </Link>
            {topics.map((topic) => {
              const active = topic.id === selectedTopic?.id;

              return (
                <Link
                  key={topic.id}
                  href={`/discover?topicId=${topic.id}`}
                  className={`inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold transition ${
                    active
                      ? "border-[#0057ff] bg-[#0057ff] text-white"
                      : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-white"
                  }`}
                >
                  {topic.title}
                </Link>
              );
            })}
          </div>
        </Surface>
      ) : null}

      <SubscriptionDiscovery
        topicId={selectedTopic?.id ?? null}
        topicOptions={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
        }))}
        categories={experience.categories}
        tags={experience.tags}
        candidates={experience.candidates}
        isZh={isZh}
      />

    </div>
  );
}
