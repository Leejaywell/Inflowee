import Link from "next/link";
import { notFound } from "next/navigation";

import {
  generateReportAction,
  saveTaskCustomScheduleAction,
  saveTaskDeliveryChannelsAction,
  saveTaskSchedulePresetAction,
} from "@/app/actions";
import { TaskControls } from "@/components/task-controls";
import { RecommendationWizard } from "@/components/recommendation-wizard";
import { SubscriptionDiscovery } from "@/components/subscription-discovery";
import { ChatConsole } from "@/components/chat-console";
import { PageHeader, SectionNav } from "@/components/ui-shell";
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
import { listConfiguredDeliveryChannels } from "@/lib/delivery";
import { buildTaskDiscoveryExperience } from "@/lib/discovery-runtime";

export const dynamic = "force-dynamic";

type TaskDetailPageProps = {
  params: Promise<{ taskId: string }>;
  searchParams?: Promise<{ section?: string }>;
};

function getReportMetric(content: Record<string, unknown>, key: string) {
  const value = content[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getReportTags(content: Record<string, unknown>) {
  const tags = content.tags;

  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => {
      if (!tag || typeof tag !== "object") {
        return null;
      }

      const record = tag as Record<string, unknown>;
      const label = record.tag;
      const count = record.count;

      if (typeof label !== "string" || typeof count !== "number") {
        return null;
      }

      return { tag: label, count };
    })
    .filter((tag): tag is { tag: string; count: number } => Boolean(tag));
}

function formatDelta(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

const SECTIONS = ["overview", "discover", "schedule", "delivery", "reports"] as const;
type Section = (typeof SECTIONS)[number];

function normalizeSection(value: string | undefined): Section {
  return SECTIONS.includes(value as Section) ? (value as Section) : "overview";
}

export default async function TaskDetailPage({ params, searchParams }: TaskDetailPageProps) {
  const { taskId } = await params;
  const sParams = await searchParams;
  const section = normalizeSection(sParams?.section);
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
    await assertTaskAccess(store, { actorId: actor.id, taskId });
  } catch {
    notFound();
  }

  const [
    activeSources,
    recommendedBundles,
    recentBriefs,
    reports,
    deliveryChannels,
  ] = await Promise.all([
    listSourcesByTask(store, taskId),
    listRecommendationBundlesByTask(store, taskId),
    listBriefsFiltered(store, { actorId: actor.id, taskId }),
    listReportsByTask(store, taskId),
    listConfiguredDeliveryChannels(store),
  ]);
  const recommendationStateKey = JSON.stringify({
    taskProfile: task.taskProfile ?? null,
    recommendedBundles,
  });
  const discoveryExperience = await buildTaskDiscoveryExperience(defaultStore, task);
  const actorScopeId = getActorScopedChatScopeId(actor.id, taskId);
  const chatThread = await findChatThread(store, "task", actorScopeId);
  const chatMessages = chatThread
    ? await listChatMessages(store, chatThread.id)
    : [];
  const schedulePreset = task.scheduleProfile?.preset ?? "always_on";
  const scheduleTimezone = task.scheduleProfile?.timezone ?? "Asia/Shanghai";
  const currentWindow = task.scheduleProfile?.windows[0];
  const isZh = locale === "zh";
  const latestReport = reports[0];
  const previousReport = reports[1];
  const latestReportTags = latestReport ? getReportTags(latestReport.content) : [];
  const maxTagCount = Math.max(1, ...latestReportTags.map((tag) => tag.count));
  const reportComparison =
    latestReport && previousReport
      ? [
          {
            label: isZh ? "简报变化" : "Brief delta",
            value: formatDelta(
              getReportMetric(latestReport.content, "briefCount") -
                getReportMetric(previousReport.content, "briefCount"),
            ),
          },
          {
            label: isZh ? "内容变化" : "Item delta",
            value: formatDelta(
              getReportMetric(latestReport.content, "itemCount") -
                getReportMetric(previousReport.content, "itemCount"),
            ),
          },
          {
            label: isZh ? "引用变化" : "Citation delta",
            value: formatDelta(
              latestReport.sourceCitations.length -
                previousReport.sourceCitations.length,
            ),
          },
        ]
      : [];

  const sectionLabels: Record<Section, string> = {
    overview: isZh ? "概览" : "Overview",
    discover: isZh ? "发现来源" : "Sources & Discovery",
    schedule: isZh ? "调度策略" : "Schedule",
    delivery: isZh ? "投递通道" : "Delivery",
    reports: isZh ? "趋势报告" : "Reports",
  };

  const sectionHref = (s: Section) =>
    s === "overview" ? `/tasks/${taskId}` : `/tasks/${taskId}?section=${s}`;

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow={t.badge}
        title={task.title}
        description={`${t.monitoringGoal} ${task.userPrompt}`}
        metrics={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stone-950 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-50">
              {task.taskType}
            </span>
            <span className="rounded-full bg-[#0057ff]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0057ff]">
              {t.level} {task.relevanceLevel}
            </span>
          </div>
        }
      />
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Link href="/" className="hover:text-stone-700">
          {t.dashboard}
        </Link>
        <span className="text-stone-300">/</span>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
          {task.title}
        </span>
      </div>
      {/* Section navigation */}
      <SectionNav
        items={SECTIONS}
        active={section}
        getHref={sectionHref}
        getLabel={(item) => sectionLabels[item]}
      />

      {/* Main content */}
      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        {/* Left: section content */}
        <div className="space-y-5">
          {section === "overview" && (
            <>
              <TaskControls
                taskId={taskId}
                initialRelevanceLevel={task.relevanceLevel}
                initialSummaryPreference={task.summaryPreference}
              />

              <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
                <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
                  <h2 className="text-lg font-semibold text-stone-950">
                    {t.subscribedSources}
                  </h2>
                  <div className="flex items-center gap-3">
                    <Link
                      href={sectionHref("discover")}
                      className="text-xs font-bold text-[#0057ff] hover:underline"
                    >
                      {isZh ? "发现更多" : "Discover more"}
                    </Link>
                    <Link
                      href="/sources"
                      className="text-xs font-medium text-stone-400 hover:text-stone-600 hover:underline"
                    >
                      {t.advancedSourceManager}
                    </Link>
                  </div>
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
                  <Link
                    href={`/inbox?taskId=${taskId}`}
                    className="text-xs font-bold text-[#0057ff] hover:underline"
                  >
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

              {latestReport && (
                <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
                  <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
                    <h2 className="text-lg font-semibold text-stone-950">
                      {isZh ? "最新报告" : "Latest Report"}
                    </h2>
                    <Link
                      href={sectionHref("reports")}
                      className="text-xs font-bold text-[#0057ff] hover:underline"
                    >
                      {isZh ? "查看全部报告" : "All reports"}
                    </Link>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      {
                        value: getReportMetric(latestReport.content, "briefCount"),
                        label: isZh ? "简报" : "Briefs",
                      },
                      {
                        value: getReportMetric(latestReport.content, "itemCount"),
                        label: isZh ? "内容" : "Items",
                      },
                      {
                        value: latestReport.sourceCitations.length,
                        label: isZh ? "引用" : "Citations",
                      },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl bg-stone-50 p-3">
                        <div className="text-xl font-semibold text-stone-950">
                          {metric.value}
                        </div>
                        <div className="text-[10px] font-semibold uppercase text-stone-400">
                          {metric.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {section === "discover" && (
            <>
              <RecommendationWizard
                key={recommendationStateKey}
                taskId={taskId}
                taskProfile={task.taskProfile ?? null}
                recommendedBundles={recommendedBundles}
                labels={dict.recommendation}
              />

              <SubscriptionDiscovery
                taskId={taskId}
                categories={discoveryExperience.categories}
                tags={discoveryExperience.tags}
                candidates={discoveryExperience.candidates}
                isZh={isZh}
              />
            </>
          )}

          {section === "schedule" && (
            <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
              <div className="mb-5 border-b border-stone-100 pb-5">
                <h2 className="text-lg font-semibold text-stone-950">
                  {isZh ? "调度策略" : "Schedule profile"}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {isZh
                    ? "控制这个监控目标何时抓取、生成报告和推送。"
                    : "Control when this monitoring goal collects, reports, and pushes."}
                </p>
              </div>

              <form
                action={saveTaskSchedulePresetAction}
                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input name="taskId" type="hidden" value={taskId} />
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {isZh ? "预设" : "Preset"}
                  <select
                    name="preset"
                    defaultValue={schedulePreset}
                    className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-stone-900 outline-none transition focus:border-stone-400"
                  >
                    <option value="always_on">{isZh ? "全天候" : "Always on"}</option>
                    <option value="morning_evening">
                      {isZh ? "早晚重点" : "Morning and evening"}
                    </option>
                    <option value="office_hours">
                      {isZh ? "工作时间" : "Office hours"}
                    </option>
                    <option value="nightly_summary">
                      {isZh ? "夜间总结" : "Nightly summary"}
                    </option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {isZh ? "时区" : "Timezone"}
                  <input
                    name="timezone"
                    defaultValue={scheduleTimezone}
                    className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-stone-900 outline-none transition focus:border-stone-400"
                  />
                </label>
                <button className="h-11 self-end rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800">
                  {isZh ? "保存" : "Save"}
                </button>
              </form>

              <form
                action={saveTaskCustomScheduleAction}
                className="mt-6 grid gap-4 border-t border-stone-100 pt-6"
              >
                <div>
                  <h3 className="text-sm font-semibold text-stone-800">
                    {isZh ? "自定义时间窗" : "Custom time window"}
                  </h3>
                  <p className="mt-1 text-xs text-stone-500">
                    {isZh
                      ? "精细控制每天的收集时段和操作。"
                      : "Fine-tune the daily collection window and actions."}
                  </p>
                </div>
                <input name="taskId" type="hidden" value={taskId} />
                <input name="timezone" type="hidden" value={scheduleTimezone} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {isZh ? "开始分钟" : "Start minute"}
                    <input
                      name="startMinutes"
                      type="number"
                      min={0}
                      max={1439}
                      defaultValue={currentWindow?.startMinutes ?? 540}
                      className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-stone-900 outline-none transition focus:border-stone-400"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {isZh ? "结束分钟" : "End minute"}
                    <input
                      name="endMinutes"
                      type="number"
                      min={1}
                      max={1440}
                      defaultValue={currentWindow?.endMinutes ?? 1080}
                      className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-stone-900 outline-none transition focus:border-stone-400"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {isZh ? "报告模式" : "Report mode"}
                    <select
                      name="reportMode"
                      defaultValue={currentWindow?.reportMode ?? "current"}
                      className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-stone-900 outline-none transition focus:border-stone-400"
                    >
                      <option value="current">current</option>
                      <option value="daily">daily</option>
                      <option value="incremental">incremental</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-stone-600">
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <label
                      key={day}
                      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-2"
                    >
                      <input
                        name="days"
                        type="checkbox"
                        value={day}
                        defaultChecked={currentWindow?.days.includes(day) ?? true}
                      />
                      {
                        (isZh
                          ? ["日", "一", "二", "三", "四", "五", "六"]
                          : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[day]
                      }
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-stone-600">
                  {[
                    ["collect", isZh ? "抓取" : "Collect", currentWindow?.collect ?? true],
                    [
                      "generateBriefs",
                      isZh ? "生成简报" : "Generate briefs",
                      currentWindow?.generateBriefs ?? true,
                    ],
                    [
                      "generateReports",
                      isZh ? "生成报告" : "Generate reports",
                      currentWindow?.generateReports ?? false,
                    ],
                    ["push", isZh ? "推送" : "Push", currentWindow?.push ?? false],
                  ].map(([name, label, checked]) => (
                    <label key={String(name)} className="inline-flex items-center gap-2">
                      <input
                        name={String(name)}
                        type="checkbox"
                        value="1"
                        defaultChecked={Boolean(checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <button className="h-11 justify-self-start rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-800 transition hover:bg-stone-50">
                  {isZh ? "保存自定义时间窗" : "Save custom window"}
                </button>
              </form>
            </section>
          )}

          {section === "delivery" && (
            <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
              <div className="mb-5 border-b border-stone-100 pb-5">
                <h2 className="text-lg font-semibold text-stone-950">
                  {isZh ? "投递通道" : "Delivery channels"}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {isZh
                    ? "留空则使用全局默认通道；没有默认时使用所有已配置通道。"
                    : "Leave empty to use global defaults, or every configured channel when no defaults exist."}
                </p>
                <Link
                  href="/settings"
                  className="mt-2 inline-block text-xs font-medium text-[#0057ff] hover:underline"
                >
                  {isZh ? "在设置中配置通道端点 →" : "Configure channel endpoints in Settings →"}
                </Link>
              </div>
              <form action={saveTaskDeliveryChannelsAction} className="grid gap-4">
                <input name="taskId" type="hidden" value={taskId} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {deliveryChannels.map((channel) => (
                    <label
                      key={channel.type}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                        channel.enabled
                          ? "border-stone-200 bg-stone-50 text-stone-800"
                          : "border-stone-100 bg-stone-50/60 text-stone-400"
                      }`}
                    >
                      <span>
                        <span className="block font-semibold">{channel.name}</span>
                        <span className="text-xs">
                          {channel.enabled
                            ? isZh
                              ? "已配置"
                              : "configured"
                            : isZh
                              ? "未配置"
                              : "not configured"}
                        </span>
                      </span>
                      <input
                        name="channels"
                        type="checkbox"
                        value={channel.type}
                        defaultChecked={
                          task.deliveryChannels?.includes(channel.type) ?? false
                        }
                        disabled={!channel.enabled}
                        className="size-4"
                      />
                    </label>
                  ))}
                </div>
                <button className="h-11 justify-self-start rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800">
                  {isZh ? "保存通道" : "Save channels"}
                </button>
              </form>
            </section>
          )}

          {section === "reports" && (
            <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-5">
                <div>
                  <h2 className="text-lg font-semibold text-stone-950">
                    {isZh ? "趋势报告" : "Trend reports"}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {isZh
                      ? "基于已保存的简报和原始内容生成时间窗口分析。"
                      : "Generate a time-window analysis from stored briefs and items."}
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
                  {isZh
                    ? "还没有报告。同步来源后可以先生成 current 报告。"
                    : "No reports yet. Generate a current report after syncing sources."}
                </div>
              ) : (
                <div className="grid gap-4">
                  {latestReport && (
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-white p-3">
                          <div className="text-lg font-semibold text-stone-950">
                            {getReportMetric(latestReport.content, "briefCount")}
                          </div>
                          <div className="text-[10px] font-semibold uppercase text-stone-400">
                            {isZh ? "简报" : "Briefs"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white p-3">
                          <div className="text-lg font-semibold text-stone-950">
                            {getReportMetric(latestReport.content, "itemCount")}
                          </div>
                          <div className="text-[10px] font-semibold uppercase text-stone-400">
                            {isZh ? "内容" : "Items"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white p-3">
                          <div className="text-lg font-semibold text-stone-950">
                            {latestReport.sourceCitations.length}
                          </div>
                          <div className="text-[10px] font-semibold uppercase text-stone-400">
                            {isZh ? "引用" : "Citations"}
                          </div>
                        </div>
                      </div>

                      {latestReportTags.length > 0 && (
                        <div className="mt-4 grid gap-2">
                          {latestReportTags.slice(0, 6).map((tag) => (
                            <div
                              key={tag.tag}
                              className="grid grid-cols-[120px_1fr_36px] items-center gap-3 text-xs"
                            >
                              <span className="truncate font-medium text-stone-700">
                                {tag.tag}
                              </span>
                              <div className="h-2 rounded-full bg-white">
                                <div
                                  className="h-2 rounded-full bg-[#0057ff]"
                                  style={{
                                    width: `${Math.max(8, (tag.count / maxTagCount) * 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-right text-stone-500">
                                {tag.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {reportComparison.length > 0 && (
                        <div className="mt-4 grid gap-2 border-t border-stone-200 pt-4 sm:grid-cols-3">
                          {reportComparison.map((metric) => (
                            <div key={metric.label} className="rounded-xl bg-white p-3">
                              <div
                                className={`text-lg font-semibold ${
                                  metric.value.startsWith("+")
                                    ? "text-emerald-700"
                                    : metric.value.startsWith("-")
                                      ? "text-rose-700"
                                      : "text-stone-700"
                                }`}
                              >
                                {metric.value}
                              </div>
                              <div className="text-[10px] font-semibold uppercase text-stone-400">
                                {metric.label}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {reports.slice(0, 5).map((report) => (
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
          )}
        </div>

        {/* Right: Chat (always visible) */}
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
