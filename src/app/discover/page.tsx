import Link from "next/link";
import { redirect } from "next/navigation";

import { SubscriptionDiscovery } from "@/components/subscription-discovery";
import { getSessionUser } from "@/lib/auth";
import {
  buildGenericDiscoveryExperience,
  buildTaskDiscoveryExperience,
} from "@/lib/discovery-runtime";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";
import { defaultStore, listTasks } from "@/lib/store";

type DiscoverPageProps = {
  searchParams?: Promise<{
    taskId?: string;
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

  const tasks = await listTasks(defaultStore, { actorId: actor.id });
  const selectedTask = params?.taskId
    ? tasks.find((task) => task.id === params.taskId) ?? null
    : null;
  const experience = selectedTask
    ? await buildTaskDiscoveryExperience(defaultStore, selectedTask)
    : buildGenericDiscoveryExperience();
  const isZh = locale === "zh";
  const dict = getDictionary(locale);

  return (
    <div className="grid gap-5">
      <section className="rounded-[18px] border border-stone-900/10 bg-white p-6">
        <span className="inline-flex rounded-full bg-stone-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-50">
          {isZh ? "订阅发现" : "Subscription discovery"}
        </span>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
              {isZh ? "按兴趣发现真实订阅源" : "Discover real sources by interest"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              {isZh
                ? "发现路线用于先浏览分类、标签和订阅源；添加时保存到已有 Topic，或新建 Topic。AI 目标路线则从一句目标生成推荐源。"
                : "Discovery lets you browse categories, tags, and sources first. Save sources to an existing Topic, or create a new Topic. The AI goal route generates recommendations from one sentence."}
            </p>
          </div>
          <Link
            href="/sources"
            className="inline-flex h-10 items-center rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            {isZh ? "自定义来源入口" : "Custom sources"}
          </Link>
        </div>
      </section>

      {tasks.length > 0 ? (
        <>
          <section className="rounded-[18px] border border-stone-900/10 bg-white p-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/discover"
                className={`inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold transition ${
                  selectedTask
                    ? "border-stone-200 bg-stone-50 text-stone-700 hover:bg-white"
                    : "border-[#0057ff] bg-[#0057ff] text-white"
                }`}
              >
                {isZh ? "全部发现" : "All discovery"}
              </Link>
              {tasks.map((task) => {
                const active = task.id === selectedTask?.id;

                return (
                  <Link
                    key={task.id}
                    href={`/discover?taskId=${task.id}`}
                    className={`inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold transition ${
                      active
                        ? "border-[#0057ff] bg-[#0057ff] text-white"
                        : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-white"
                    }`}
                  >
                    {task.title}
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      <SubscriptionDiscovery
        taskId={selectedTask?.id ?? null}
        taskOptions={tasks.map((task) => ({
          id: task.id,
          title: task.title,
        }))}
        categories={experience.categories}
        tags={experience.tags}
        candidates={experience.candidates}
        isZh={isZh}
      />

      <section className="rounded-[18px] border border-stone-900/10 bg-white p-6 text-sm leading-6 text-stone-500">
        {isZh
          ? `发现页添加的来源会保存到 Topic，并和 ${dict.shell.sources} 页面里的自定义来源进入同一个 Source 模型。每个 Topic 后续可以配置独立同步、报告和投递策略。`
          : `Sources added here are saved to Topics and use the same Source model as ${dict.shell.sources}. Each Topic can later have its own sync, report, and delivery strategy.`}
      </section>
    </div>
  );
}
