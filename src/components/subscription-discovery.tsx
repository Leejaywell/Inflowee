"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createTaskAndSubscribeDiscoverySources,
  previewRecommendedSources,
  subscribeDiscoverySources,
} from "@/app/actions-chat";
import type {
  DiscoveryCategory,
  DiscoverySourceCandidate,
  DiscoveryTag,
} from "@/lib/discovery-catalog";
import {
  filterDiscoverySourceCandidates,
  getDiscoveryTagBatch,
} from "@/lib/discovery-catalog";
import type { SubscriptionPreviewResult } from "@/lib/source-ingestion";

type SubscriptionDiscoveryProps = {
  taskId?: string | null;
  taskOptions?: Array<{ id: string; title: string }>;
  categories: DiscoveryCategory[];
  tags: DiscoveryTag[];
  candidates: DiscoverySourceCandidate[];
  isZh: boolean;
};

export function SubscriptionDiscovery({
  taskId,
  taskOptions = [],
  categories,
  tags,
  candidates,
  isZh,
}: SubscriptionDiscoveryProps) {
  const router = useRouter();
  const [selectedTaskId, setSelectedTaskId] = useState(taskId ?? taskOptions[0]?.id ?? "");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPrompt, setNewTaskPrompt] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [batchIndex, setBatchIndex] = useState(0);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<SubscriptionPreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdBriefCount, setCreatedBriefCount] = useState(0);
  const [isAdding, startAddTransition] = useTransition();
  const [isPreviewing, startPreviewTransition] = useTransition();
  const visibleTags = useMemo(
    () =>
      getDiscoveryTagBatch(
        [...tags]
          .filter(
            (tag) => tag.categoryId === "all" || tag.categoryId === categoryId,
          )
          .sort((a, b) => {
            const aScore =
              Math.sin((a.weight + shuffleSeed + a.id.length) * 999) * 1000;
            const bScore =
              Math.sin((b.weight + shuffleSeed + b.id.length) * 999) * 1000;
            return bScore - aScore || b.weight - a.weight;
          }),
        batchIndex,
      ),
    [batchIndex, categoryId, shuffleSeed, tags],
  );
  const visibleCandidates = useMemo(
    () =>
      filterDiscoverySourceCandidates({
        candidates,
        categoryId,
        selectedTagIds,
      }).slice(0, 10),
    [candidates, categoryId, selectedTagIds],
  );
  const selectedCandidates = visibleCandidates.filter((candidate) =>
    selectedCandidateIds.includes(candidate.id),
  );
  const effectiveTaskId = taskId ?? selectedTaskId;
  const shouldCreateTopicForSelection = !taskId && !effectiveTaskId;

  const resetForCategory = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    setBatchIndex(0);
    setSelectedTagIds([]);
    setSelectedCandidateIds([]);
    setPreview(null);
    setMessage(null);
    setError(null);
    setCreatedBriefCount(0);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((candidate) => candidate !== tagId)
        : [...current, tagId],
    );
    setSelectedCandidateIds([]);
    setPreview(null);
    setMessage(null);
    setError(null);
    setCreatedBriefCount(0);
  };

  const toggleCandidate = (candidateId: string) => {
    setSelectedCandidateIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    );
    setPreview(null);
    setMessage(null);
    setError(null);
    setCreatedBriefCount(0);
  };

  const previewSelected = () => {
    if (selectedCandidates.length === 0) {
      return;
    }

    setPreview(null);
    setMessage(null);
    setError(null);
    startPreviewTransition(async () => {
      try {
        if (!effectiveTaskId) {
          setError(
            isZh
              ? "预览需要先选择已有 Topic；新 Topic 添加后会直接同步并生成首批简报。"
              : "Preview requires an existing Topic. New Topics sync and create the first briefs after adding.",
          );
          return;
        }

        const result = await previewRecommendedSources(
          effectiveTaskId,
          selectedCandidates.map((candidate) => ({
            title: candidate.title,
            url: candidate.url,
            sourceType: candidate.sourceType,
          })),
        );
        setPreview(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : isZh
              ? "暂时无法预览选中的订阅源。"
              : "Unable to preview selected sources.",
        );
      }
    });
  };

  const addSelected = () => {
    if (selectedCandidateIds.length === 0) {
      return;
    }

    setMessage(null);
    setError(null);
    startAddTransition(async () => {
      try {
        const result = effectiveTaskId
          ? await subscribeDiscoverySources(effectiveTaskId, selectedCandidateIds, {
              categoryId,
              selectedTagIds,
            })
          : await createTaskAndSubscribeDiscoverySources({
              title: newTaskTitle,
              userPrompt: newTaskPrompt,
              candidateIds: selectedCandidateIds,
              categoryId,
              selectedTagIds,
            });
        setMessage(
          isZh
            ? `已添加 ${result.createdSourceIds.length} 个来源，首次同步 ${result.syncedSourceCount} 个，生成 ${result.createdBriefCount} 份简报，跳过 ${result.skippedCandidateIds.length} 个。`
            : `Added ${result.createdSourceIds.length} sources, synced ${result.syncedSourceCount}, created ${result.createdBriefCount} briefs, skipped ${result.skippedCandidateIds.length}.`,
        );
        setCreatedBriefCount(result.createdBriefCount);
        setSelectedCandidateIds([]);
        if ("taskId" in result && typeof result.taskId === "string") {
          setSelectedTaskId(result.taskId);
        }
        setPreview(null);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : isZh
              ? "无法添加选中的订阅源。"
              : "Unable to add selected sources.",
        );
      }
    });
  };

  return (
    <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
      <div className="border-b border-stone-100 pb-4">
        <h2 className="text-lg font-semibold text-stone-950">
          {isZh ? "按分类发现订阅源" : "Discover sources by category"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-stone-500">
          {isZh
            ? "先选大分类，再用兴趣标签筛选来源。自定义 URL 仍在高级来源管理里添加。"
            : "Pick a broad category, then use interest tags to find sources. Custom URLs stay in advanced source management."}
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => resetForCategory(category.id)}
            className={`min-h-28 rounded-2xl border p-4 text-left transition ${
              category.id === categoryId
                ? "border-stone-950 bg-stone-950 text-white"
                : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-300"
            }`}
          >
            <span
              className={`inline-flex size-8 items-center justify-center rounded-xl text-xs font-semibold text-white ${category.accent}`}
            >
              {category.icon}
            </span>
            <span className="mt-3 block text-sm font-semibold">{category.title}</span>
            <span
              className={`mt-1 block text-xs leading-5 ${
                category.id === categoryId ? "text-stone-300" : "text-stone-500"
              }`}
            >
              {category.description}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-stone-950">
            {isZh ? "兴趣标签" : "Interest tags"}
          </h3>
          <button
            type="button"
            onClick={() => {
              setBatchIndex((current) => current + 1);
              setShuffleSeed(Date.now());
              setPreview(null);
            }}
            className="h-9 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            {isZh ? "换一批" : "Change batch"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);

            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  selected
                    ? "border-[#0057ff] bg-[#0057ff] text-white"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                }`}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-stone-950">
            {isZh ? "订阅源候选" : "Source candidates"}
          </h3>
          <span className="text-xs text-stone-400">
            {visibleCandidates.length} {isZh ? "个候选" : "candidates"}
          </span>
        </div>
        {visibleCandidates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
            {isZh
              ? "当前标签没有匹配来源。换一批标签或选择其他分类。"
              : "No matching sources. Change the tag batch or choose another category."}
          </div>
        ) : (
          visibleCandidates.map((candidate) => {
            const selected = selectedCandidateIds.includes(candidate.id);

            return (
              <label
                key={candidate.id}
                className={`grid gap-3 rounded-2xl border p-4 transition sm:grid-cols-[auto_1fr] ${
                  selected
                    ? "border-[#0057ff] bg-[#0057ff]/5"
                    : "border-stone-200 bg-stone-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleCandidate(candidate.id)}
                  className="mt-1 size-4"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-950">
                      {candidate.title}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-stone-500">
                      {candidate.origin}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-stone-500">
                      {candidate.sourceType}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-stone-500">
                    {candidate.url}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-stone-600">
                    {candidate.description}
                  </span>
                  <span className="mt-3 flex flex-wrap gap-2">
                    {candidate.subscriberCount ? (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-500">
                        {candidate.subscriberCount.toLocaleString()}{" "}
                        {isZh ? "订阅" : "subs"}
                      </span>
                    ) : null}
                    {candidate.recentSubscriberGrowth ? (
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
                        +{candidate.recentSubscriberGrowth.toLocaleString()}{" "}
                        {isZh ? "近 7 天" : "7d"}
                      </span>
                    ) : null}
                    {candidate.heatScore ? (
                      <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-700">
                        {isZh ? "热度" : "Heat"} {candidate.heatScore}
                      </span>
                    ) : null}
                    {candidate.relevanceScore ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                        {isZh ? "相关" : "Relevant"}{" "}
                        {Math.round(candidate.relevanceScore * 100)}%
                      </span>
                    ) : null}
                    {candidate.trendLabels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-500"
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>

      {!taskId ? (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <h3 className="text-sm font-semibold text-stone-950">
            {isZh ? "保存到 Topic" : "Save to Topic"}
          </h3>
          {taskOptions.length > 0 ? (
            <label className="mt-3 grid gap-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                {isZh ? "已有 Topic" : "Existing Topic"}
              </span>
              <select
                value={selectedTaskId}
                onChange={(event) => setSelectedTaskId(event.currentTarget.value)}
                className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
              >
                <option value="">{isZh ? "新建 Topic" : "Create new Topic"}</option>
                {taskOptions.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {shouldCreateTopicForSelection ? (
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {isZh ? "Topic 名称" : "Topic name"}
                </span>
                <input
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.currentTarget.value)}
                  placeholder={isZh ? "AI 编程工具动向" : "AI coding tools"}
                  className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {isZh ? "关注重点（可选）" : "Focus note (optional)"}
                </span>
                <textarea
                  value={newTaskPrompt}
                  onChange={(event) => setNewTaskPrompt(event.currentTarget.value)}
                  rows={3}
                  placeholder={
                    isZh
                      ? "例如：更关注新产品、融资和重要更新。"
                      : "Example: focus more on new products, funding, and important updates."
                  }
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-stone-400"
                />
              </label>
            </div>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-stone-500">
            {isZh
              ? "发现路线可以先浏览和勾选来源；添加时保存为 Topic。AI 目标路线则从一句目标生成推荐源，最终也落到 Topic。"
              : "Discovery lets you browse and select sources first, then save them as a Topic. The AI goal route also ends in a Topic after generating recommended sources from one sentence."}
          </p>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-4 grid gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800 sm:grid-cols-4">
          <span>{preview.sourceCount} {isZh ? "来源" : "sources"}</span>
          <span>{preview.candidateItemCount} {isZh ? "内容" : "items"}</span>
          <span>{preview.acceptedItemCount} {isZh ? "可生成" : "brief-ready"}</span>
          <span>{preview.rejectedItemCount} {isZh ? "已过滤" : "filtered"}</span>
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p>{message}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/inbox"
              className="inline-flex h-9 items-center rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
            >
              {createdBriefCount > 0
                ? isZh
                  ? "查看首批简报"
                  : "View briefs"
                : isZh
                  ? "打开简报箱"
                  : "Open inbox"}
            </Link>
            <Link
              href="/sources"
              className="inline-flex h-9 items-center rounded-xl border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
            >
              {isZh ? "查看来源" : "View sources"}
            </Link>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={addSelected}
          disabled={
            selectedCandidateIds.length === 0 ||
            isAdding ||
            (!effectiveTaskId && newTaskTitle.trim().length < 2)
          }
          className="h-11 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
        >
          {isAdding
            ? isZh
              ? "添加中..."
              : "Adding..."
            : isZh
              ? `添加 ${selectedCandidateIds.length} 个来源`
              : `Add ${selectedCandidateIds.length} sources`}
        </button>
        <button
          type="button"
          onClick={previewSelected}
          disabled={selectedCandidateIds.length === 0 || isPreviewing || !effectiveTaskId}
          className="h-11 rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
        >
          {isPreviewing ? (isZh ? "预览中..." : "Previewing...") : isZh ? "预览已选" : "Preview selected"}
        </button>
      </div>
    </section>
  );
}
