"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  analyzeDiscoveryNeed,
  createTopicAndSubscribeDiscoverySources,
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
import type { DiscoveryExperience } from "@/lib/discovery-runtime";
import type { SubscriptionPreviewResult } from "@/lib/source-ingestion";

type SubscriptionDiscoveryProps = {
  topicId?: string | null;
  topicOptions?: Array<{ id: string; title: string }>;
  categories: DiscoveryCategory[];
  tags: DiscoveryTag[];
  candidates: DiscoverySourceCandidate[];
  isZh: boolean;
};

export function SubscriptionDiscovery({
  topicId,
  topicOptions = [],
  categories,
  tags,
  candidates,
  isZh,
}: SubscriptionDiscoveryProps) {
  const router = useRouter();
  const [selectedTopicId, setSelectedTopicId] = useState(topicId ?? topicOptions[0]?.id ?? "");
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicPrompt, setNewTopicPrompt] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResults, setAiResults] = useState<DiscoveryExperience | null>(null);
  const [isAnalyzing, startAnalyzeTransition] = useTransition();
  const [categoryId, setCategoryId] = useState("all");
  const [batchIndex, setBatchIndex] = useState(0);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdBriefCount, setCreatedBriefCount] = useState(0);
  const [isAdding, startAddTransition] = useTransition();
  // preview kept for possible future use
  const [_preview, _setPreview] = useState<SubscriptionPreviewResult | null>(null);
  const [_isPreviewing, _startPreviewTransition] = useTransition();

  const effectiveTags = aiResults?.tags ?? tags;
  const effectiveCandidates = aiResults?.candidates ?? candidates;
  const effectiveCategories = aiResults?.categories ?? categories;

  // Step 1 is "done" when the user has either run AI analysis or chosen a non-default category,
  // or when we already have a topic context (pre-loaded AI experience).
  const step1Done = aiResults !== null || categoryId !== "all" || !!topicId;

  const visibleTags = useMemo(
    () =>
      getDiscoveryTagBatch(
        [...effectiveTags]
          .filter((tag) => tag.categoryId === "all" || tag.categoryId === categoryId)
          .sort((a, b) => {
            const aScore = Math.sin((a.weight + shuffleSeed + a.id.length) * 999) * 1000;
            const bScore = Math.sin((b.weight + shuffleSeed + b.id.length) * 999) * 1000;
            return bScore - aScore || b.weight - a.weight;
          }),
        batchIndex,
      ),
    [batchIndex, categoryId, shuffleSeed, effectiveTags],
  );

  const visibleCandidates = useMemo(
    () =>
      filterDiscoverySourceCandidates({
        candidates: effectiveCandidates,
        categoryId,
        selectedTagIds,
      }).slice(0, 10),
    [effectiveCandidates, categoryId, selectedTagIds],
  );

  const effectiveTopicId = topicId ?? selectedTopicId;
  const shouldCreateTopicForSelection = !topicId && !effectiveTopicId;

  const analyzeNeed = () => {
    if (!aiPrompt.trim()) return;
    setSelectedTagIds([]);
    setSelectedCandidateIds([]);
    setMessage(null);
    setError(null);
    setCreatedBriefCount(0);
    startAnalyzeTransition(async () => {
      try {
        const result = await analyzeDiscoveryNeed(aiPrompt);
        setAiResults(result);
        setCategoryId("all");
        setBatchIndex(0);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : isZh
              ? "AI 分析失败，请稍后重试。"
              : "AI analysis failed. Please try again.",
        );
      }
    });
  };

  const clearAiResults = () => {
    setAiResults(null);
    setAiPrompt("");
    setSelectedTagIds([]);
    setSelectedCandidateIds([]);
    setCategoryId("all");
  };

  const resetForCategory = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    setBatchIndex(0);
    setSelectedTagIds([]);
    setSelectedCandidateIds([]);
    setMessage(null);
    setError(null);
    setCreatedBriefCount(0);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
    setSelectedCandidateIds([]);
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
    setMessage(null);
    setError(null);
    setCreatedBriefCount(0);
  };

  const addSelected = () => {
    if (selectedCandidateIds.length === 0) return;
    setMessage(null);
    setError(null);
    startAddTransition(async () => {
      try {
        const result = effectiveTopicId
          ? await subscribeDiscoverySources(effectiveTopicId, selectedCandidateIds, {
              categoryId,
              selectedTagIds,
            })
          : await createTopicAndSubscribeDiscoverySources({
              title: newTopicTitle,
              userPrompt: newTopicPrompt || aiPrompt,
              candidateIds: selectedCandidateIds,
              categoryId,
              selectedTagIds,
            });
        const added = result.createdSourceIds.length;
        const briefs = result.createdBriefCount;
        setMessage(
          isZh
            ? briefs > 0
              ? `已添加 ${added} 个来源，生成了 ${briefs} 份简报。`
              : `已添加 ${added} 个来源。`
            : briefs > 0
              ? `Added ${added} sources — ${briefs} briefs created.`
              : `Added ${added} sources.`,
        );
        setCreatedBriefCount(result.createdBriefCount);
        setSelectedCandidateIds([]);
        if ("topicId" in result && typeof result.topicId === "string") {
          setSelectedTopicId(result.topicId);
        }
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

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function sourceTypeLabel(type: string) {
    const map: Record<string, [string, string]> = {
      RSS_FEED: ["RSS", "RSS"],
      ATOM_FEED: ["Atom", "Atom"],
      SEARCH_DISCOVERY: ["搜索", "Search"],
      SOCIAL_DISCOVERY: ["社交", "Social"],
      COMMUNITY_DISCOVERY: ["社区", "Community"],
      HOTLIST_DISCOVERY: ["热榜", "Trending"],
    };
    const [zh, en] = map[type] ?? [type, type];
    return isZh ? zh : en;
  }

  // ─── Step indicator dot ────────────────────────────────────────────────────
  function StepDot({ n, active }: { n: number; active: boolean }) {
    return (
      <span
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition ${
          active ? "bg-[#0057ff] text-white" : "bg-stone-100 text-stone-500"
        }`}
      >
        {n}
      </span>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-stone-900/10 bg-white shadow-[0_16px_50px_rgba(33,24,9,0.06)]">

      {/* ── STEP 1: Define your interest ─────────────────────────────────── */}
      <div className="p-6">
        <div className="flex items-center gap-2.5">
          <StepDot n={1} active={step1Done} />
          <h2 className="text-sm font-semibold text-stone-900">
            {isZh ? "输入需求" : "What to monitor"}
          </h2>
        </div>

        <div className="mt-4 grid gap-3">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) analyzeNeed();
            }}
            rows={2}
            placeholder={
              isZh
                ? "例如：关注 AI 编程工具的新产品、融资和重要更新。"
                : "Example: monitor new products, funding, and updates for AI coding tools."
            }
            className="resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 outline-none transition focus:border-stone-400 focus:bg-white"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={analyzeNeed}
              disabled={!aiPrompt.trim() || isAnalyzing}
              className="h-9 rounded-xl bg-[#0057ff] px-4 text-xs font-semibold text-white transition hover:bg-[#0049d6] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
            >
              {isAnalyzing
                ? isZh ? "分析中…" : "Analyzing…"
                : isZh ? "AI 分析" : "Analyze"}
            </button>
            {aiResults ? (
              <span className="text-xs text-stone-500">
                <span className="font-medium text-emerald-600">
                  {isZh
                    ? `找到 ${aiResults.candidates.length} 个来源`
                    : `${aiResults.candidates.length} sources found`}
                </span>
                {" · "}
                <button
                  type="button"
                  onClick={clearAiResults}
                  className="underline hover:no-underline"
                >
                  {isZh ? "清除" : "Clear"}
                </button>
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs text-stone-400">
            {isZh ? "或按分类浏览" : "Or browse by category"}
          </p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {effectiveCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => resetForCategory(category.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  category.id === categoryId
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300"
                }`}
              >
                <span>{category.icon}</span>
                {category.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── STEP 2: Tags ─────────────────────────────────────────────────── */}
      {step1Done && (
        <div className="border-t border-stone-100 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <StepDot n={2} active={selectedTagIds.length > 0} />
              <h2 className="text-sm font-semibold text-stone-900">
                {isZh ? "标签" : "Tags"}
                {selectedTagIds.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-stone-400">
                    {isZh ? `${selectedTagIds.length} 个已选` : `${selectedTagIds.length} selected`}
                  </span>
                )}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setBatchIndex((i) => i + 1);
                setShuffleSeed(Date.now());
              }}
              className="text-xs text-stone-400 transition hover:text-stone-600"
            >
              {isZh ? "换一批" : "More tags"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {visibleTags.length === 0 ? (
              <span className="text-xs text-stone-400">
                {isZh ? "暂无相关标签" : "No tags available"}
              </span>
            ) : (
              visibleTags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? "border-[#0057ff] bg-[#0057ff] text-white"
                        : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300"
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: Sources ──────────────────────────────────────────────── */}
      {step1Done && (
        <div className="border-t border-stone-100 p-6">
          <div className="flex items-center gap-2.5">
            <StepDot n={3} active={selectedCandidateIds.length > 0} />
            <h2 className="text-sm font-semibold text-stone-900">
              {isZh ? "来源" : "Sources"}
            </h2>
            <span className="text-xs text-stone-400">
              {visibleCandidates.length}
              {isZh ? " 个" : ""}
              {selectedCandidateIds.length > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-[#0057ff]">
                    {isZh ? `${selectedCandidateIds.length} 已选` : `${selectedCandidateIds.length} selected`}
                  </span>
                </>
              )}
            </span>
          </div>

          <div className="mt-4 grid gap-2">
            {visibleCandidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-400">
                {isZh
                  ? "没有匹配的来源，试试换一批标签。"
                  : "No matching sources. Try different tags."}
              </div>
            ) : (
              visibleCandidates.map((candidate) => {
                const selected = selectedCandidateIds.includes(candidate.id);
                return (
                  <div
                    key={candidate.id}
                    className={`flex gap-3 rounded-2xl border p-4 transition ${
                      selected
                        ? "border-[#0057ff] bg-[#0057ff]/5"
                        : "border-stone-100 bg-stone-50 hover:border-stone-200"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold text-stone-950">{candidate.title}</span>
                          <span className="ml-2 text-[10px] font-semibold text-stone-400">
                            {sourceTypeLabel(candidate.sourceType)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleCandidate(candidate.id)}
                          className={`flex size-8 shrink-0 items-center justify-center rounded-xl text-base font-medium transition ${
                            selected
                              ? "bg-[#0057ff] text-white"
                              : "bg-stone-200 text-stone-500 hover:bg-stone-300"
                          }`}
                        >
                          {selected ? "−" : "+"}
                        </button>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-stone-400">{candidate.url}</p>
                      <p className="mt-1.5 text-sm leading-5 text-stone-600">{candidate.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {candidate.subscriberCount ? (
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                            {candidate.subscriberCount.toLocaleString()}{" "}
                            {isZh ? "订阅" : "subs"}
                          </span>
                        ) : null}
                        {candidate.recentSubscriberGrowth ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-600">
                            +{candidate.recentSubscriberGrowth.toLocaleString()}{" "}
                            {isZh ? "近7天" : "7d"}
                          </span>
                        ) : null}
                        {candidate.heatScore ? (
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                            {isZh ? "热度" : "Heat"} {candidate.heatScore}
                          </span>
                        ) : null}
                        {candidate.relevanceScore ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                            {isZh ? "相关" : "Rel."}{" "}
                            {Math.round(candidate.relevanceScore * 100)}%
                          </span>
                        ) : null}
                        {candidate.trendLabels.slice(0, 2).map((label) => (
                          <span
                            key={label}
                            className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-400"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── STEP 4: Save ─────────────────────────────────────────────────── */}
      {selectedCandidateIds.length > 0 && (
        <div className="rounded-b-[24px] border-t border-stone-200 bg-stone-50 p-6">
          <div className="flex items-center gap-2.5">
            <StepDot n={4} active={false} />
            <h2 className="text-sm font-semibold text-stone-900">
              {isZh ? "添加到话题" : "Add to topic"}
            </h2>
          </div>

          {!topicId && (
            <div className="mt-4 grid gap-3">
              {topicOptions.length > 0 ? (
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    {isZh ? "话题" : "Topic"}
                  </span>
                  <select
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(e.currentTarget.value)}
                    className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
                  >
                    <option value="">{isZh ? "新建话题" : "New topic"}</option>
                    {topicOptions.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {shouldCreateTopicForSelection && (
                <>
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                      {isZh ? "话题名称" : "Topic name"}
                    </span>
                    <input
                      value={newTopicTitle}
                      onChange={(e) => setNewTopicTitle(e.currentTarget.value)}
                      placeholder={isZh ? "例如：AI 编程工具" : "e.g. AI coding tools"}
                      className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400"
                    />
                  </label>
                  {!aiPrompt && (
                    <label className="grid gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                        {isZh ? "备注" : "Note"}
                      </span>
                      <textarea
                        value={newTopicPrompt}
                        onChange={(e) => setNewTopicPrompt(e.currentTarget.value)}
                        rows={2}
                        placeholder={
                          isZh
                            ? "关注重点、过滤条件等（可选）"
                            : "Focus areas, filters, etc. (optional)"
                        }
                        className="resize-none rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-stone-400"
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addSelected}
              disabled={isAdding}
              className="h-10 rounded-xl bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
            >
              {isAdding
                ? isZh ? "添加中…" : "Adding…"
                : isZh
                  ? `添加 ${selectedCandidateIds.length} 个来源`
                  : `Add ${selectedCandidateIds.length} sources`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCandidateIds([])}
              className="h-10 rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-600 transition hover:bg-stone-100"
            >
              {isZh ? "清空" : "Clear"}
            </button>
          </div>
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      {(message || error) && (
        <div className="border-t border-stone-100 px-6 pb-6 pt-5 grid gap-3">
          {message ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <p>{message}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/inbox"
                  className="inline-flex h-9 items-center rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
                >
                  {createdBriefCount > 0
                    ? isZh ? "查看首批简报" : "View briefs"
                    : isZh ? "打开简报箱" : "Open inbox"}
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
            <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      )}

    </section>
  );
}
