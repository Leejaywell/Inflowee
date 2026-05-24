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
  const selectedTask =
    tasks.find((task) => task.id === params?.taskId) ?? tasks[0] ?? null;
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
                ? "可以先浏览大分类、标签和候选来源；添加来源时再选择已有目标，或直接创建一个新监控目标。"
                : "Browse broad categories, tags, and source candidates first. Choose or create a monitoring goal only when adding sources."}
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
          ? `发现页添加的来源会和 ${dict.shell.sources} 页面里的自定义来源进入同一个 Source 模型，后续同步、过滤、Brief 和投递流程保持一致。`
          : `Sources added here use the same Source model as ${dict.shell.sources}, then flow through the existing sync, filtering, Brief, and delivery pipeline.`}
      </section>
    </div>
  );
}
