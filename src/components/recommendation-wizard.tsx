"use client";

import { useState, useTransition } from "react";
import { refreshStoredTopicIntelligence } from "@/app/actions";
import {
  previewRecommendedSources,
  subscribeRecommendedSources,
} from "@/app/actions-chat";
import { SourceBundle, SourceRecommendation, TopicProfile } from "@/lib/ai";
import type { SourceType } from "@/lib/store";
import type { SubscriptionPreviewResult } from "@/lib/source-ingestion";

type RecommendationWizardProps = {
  topicId: string;
  topicProfile: TopicProfile | null;
  recommendedBundles: SourceBundle[];
  labels?: RecommendationWizardLabels;
};

export type RecommendationWizardLabels = {
  noRecommendations: string;
  noIntelligence: string;
  refreshHint: string;
  refreshIntelligence: string;
  refreshingIntelligence: string;
  refreshError: string;
  previewError: string;
  subscribedTitle: string;
  subscribedDescription: string;
  viewChannels: string;
  title: string;
  description: string;
  selectStep: string;
  previewStep: string;
  confirmStep: string;
  refreshing: string;
  package: string;
  rationale: string;
  sourcesInBundle: string;
  previewTitle: string;
  previewDescription: string;
  previewing: string;
  previewSelected: string;
  sourcesChecked: string;
  itemsFound: string;
  briefReady: string;
  filtered: string;
  recommendedCadence: string;
  notificationLevel: string;
  confirming: string;
  confirm: string;
};

const defaultLabels: RecommendationWizardLabels = {
  noRecommendations: "No stored recommendations are available for this Topic yet.",
  noIntelligence: "This Topic has no stored intelligence yet.",
  refreshHint: "Refresh to regenerate source bundles from the saved Topic profile.",
  refreshIntelligence: "Refresh intelligence",
  refreshingIntelligence: "Refreshing intelligence...",
  refreshError: "Unable to refresh recommendations right now.",
  previewError: "Unable to preview selected subscriptions.",
  subscribedTitle: "Subscribed successfully!",
  subscribedDescription:
    "Your new intelligence channels are set up. Run synchronization from the Sources tab to fetch raw updates.",
  viewChannels: "View feed channels",
  title: "Recommended subscriptions",
  description: "Choose source packages, preview likely briefs, then confirm.",
  selectStep: "Select sources",
  previewStep: "Preview",
  confirmStep: "Confirm",
  refreshing: "Refreshing...",
  package: "Subscription package",
  rationale: "AI Rationale",
  sourcesInBundle: "Sources in bundle",
  previewTitle: "First sync preview",
  previewDescription: "Runs a light check without saving sources.",
  previewing: "Previewing...",
  previewSelected: "Preview selected",
  sourcesChecked: "Sources checked",
  itemsFound: "Items found",
  briefReady: "Brief-ready",
  filtered: "Filtered",
  recommendedCadence: "Recommended cadence: every {minutes} minutes",
  notificationLevel: "notification level: {level}",
  confirming: "Confirming subscriptions...",
  confirm: "Confirm {count} subscription{s}",
};

type SelectedSource = {
  title: string;
  url: string;
  sourceType: SourceType;
};

type WizardStep = "select" | "preview" | "confirm";

export function RecommendationWizard({
  topicId,
  topicProfile,
  recommendedBundles,
  labels: labelsProp,
}: RecommendationWizardProps) {
  const labels = labelsProp ?? defaultLabels;
  // Store selected sources as mapping of url -> source object
  const [selectedMap, setSelectedMap] = useState<Record<string, SelectedSource>>(() => {
    const initial: Record<string, SelectedSource> = {};
    for (const bundle of recommendedBundles) {
      for (const src of bundle.sources) {
        initial[src.url] = {
          title: src.title,
          url: src.url,
          sourceType: src.sourceType,
        };
      }
    }
    return initial;
  });

  const [isPending, startTransition] = useTransition();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isPreviewing, startPreviewTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SubscriptionPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>("select");

  const toggleSource = (src: SourceRecommendation) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[src.url]) {
        delete next[src.url];
      } else {
        next[src.url] = {
          title: src.title,
          url: src.url,
          sourceType: src.sourceType,
        };
      }
      return next;
    });
  };

  const handleSubscribe = () => {
    const list = Object.values(selectedMap);
    if (list.length === 0 || !preview) return;

    setSuccess(false);
    startTransition(async () => {
      try {
        await subscribeRecommendedSources(topicId, list);
        setSuccess(true);
        // Clear selection map after subscribing
        setSelectedMap({});
      } catch (err) {
        console.error("Failed to subscribe sources:", err);
      }
    });
  };

  const handlePreview = () => {
    const list = Object.values(selectedMap);
    if (list.length === 0) return;

    setPreview(null);
    setPreviewError(null);
    startPreviewTransition(async () => {
      try {
        const result = await previewRecommendedSources(topicId, list);
        setPreview(result);
        setStep("confirm");
      } catch (err) {
        setPreviewError(
          err instanceof Error
            ? err.message
            : labels.previewError,
        );
      }
    });
  };

  const handleRefresh = () => {
    setRefreshError(null);
    startRefreshTransition(async () => {
      try {
        await refreshStoredTopicIntelligence(topicId);
      } catch (error) {
        setRefreshError(
          error instanceof Error
            ? error.message
            : labels.refreshError,
        );
      }
    });
  };

  const selectedCount = Object.keys(selectedMap).length;
  const stepItems: Array<{ key: WizardStep; label: string }> = [
    { key: "select", label: labels.selectStep },
    { key: "preview", label: labels.previewStep },
    { key: "confirm", label: labels.confirmStep },
  ];

  if (recommendedBundles.length === 0) {
    return (
      <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)] text-center py-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-stone-500 font-medium">
              {topicProfile
                ? labels.noRecommendations
                : labels.noIntelligence}
            </p>
            {topicProfile ? (
              <p className="text-xs text-stone-400">
                {labels.refreshHint}
              </p>
            ) : null}
            {refreshError ? (
              <p className="text-xs text-rose-600">{refreshError}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 px-4 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
          >
            {isRefreshing ? labels.refreshingIntelligence : labels.refreshIntelligence}
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-[24px] border border-stone-900/10 bg-white p-8 shadow-[0_16px_50px_rgba(33,24,9,0.06)] text-center space-y-4 animate-fade-in">
        <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-semibold text-stone-950">{labels.subscribedTitle}</h3>
          <p className="text-sm text-stone-500 max-w-sm mx-auto leading-normal">
            {labels.subscribedDescription}
          </p>
        </div>
        <button
          onClick={() => setSuccess(false)}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-stone-50 transition hover:bg-stone-800"
        >
          {labels.viewChannels}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)] space-y-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-stone-950">
              {labels.title}
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              {labels.description}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 px-3 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
          >
            {isRefreshing ? labels.refreshing : labels.refreshIntelligence}
          </button>
        </div>
        {refreshError ? (
          <p className="mt-2 text-xs text-rose-600">{refreshError}</p>
        ) : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {stepItems.map((item, index) => {
            const isActive = item.key === step;
            const isComplete =
              (item.key === "select" && selectedCount > 0 && step !== "select") ||
              (item.key === "preview" && Boolean(preview) && step === "confirm");

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (item.key === "select") {
                    setStep("select");
                  } else if (item.key === "preview" && selectedCount > 0) {
                    setStep("preview");
                  } else if (item.key === "confirm" && preview) {
                    setStep("confirm");
                  }
                }}
                disabled={
                  (item.key === "preview" && selectedCount === 0) ||
                  (item.key === "confirm" && !preview)
                }
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isActive
                    ? "border-[#0057ff] bg-[#0057ff]/10 text-[#0057ff]"
                    : isComplete
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-stone-200 bg-stone-50 text-stone-500"
                }`}
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px]">
                  {isComplete ? "✓" : index + 1}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {step === "select" ? (
        <div className="space-y-6">
          {recommendedBundles.map((bundle, bIdx) => (
            <div
              key={bIdx}
              className="rounded-2xl border border-stone-200 bg-stone-50/50 p-5 space-y-4"
            >
              <div>
                <span className="inline-flex rounded-full bg-[#0057ff]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0057ff] uppercase">
                  {labels.package}
                </span>
                <h3 className="text-lg font-bold text-stone-950 mt-1.5">{bundle.title}</h3>
                <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                  {bundle.description}
                </p>
              </div>

              <div className="rounded-xl bg-[#f7f1e9]/60 border border-[#f7f1e9] p-4 text-xs text-stone-600 leading-relaxed italic flex gap-2.5 items-start">
                <span className="text-lg font-serif text-stone-400 select-none">“</span>
                <div>
                  <span className="font-semibold text-stone-700 not-italic block mb-0.5">
                    {labels.rationale}
                  </span>
                  {bundle.rationale}
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                  {labels.sourcesInBundle}
                </span>
                <div className="grid gap-2">
                  {bundle.sources.map((src) => {
                    const isChecked = !!selectedMap[src.url];
                    return (
                      <label
                        key={src.url}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer select-none ${
                          isChecked
                            ? "bg-white border-[#0057ff]/30 shadow-sm"
                            : "bg-white/40 border-stone-200 hover:bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            toggleSource(src);
                            setPreview(null);
                            setPreviewError(null);
                          }}
                          className="h-4 w-4 rounded border-stone-300 text-[#0057ff] focus:ring-[#0057ff]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-900 truncate">
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
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setStep("preview")}
            disabled={selectedCount === 0}
            className="w-full h-12 rounded-2xl bg-stone-950 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
          >
            {labels.previewTitle}
          </button>
        </div>
      ) : null}

      {step === "preview" || step === "confirm" ? (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-950">
              {labels.previewTitle}
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              {labels.previewDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={handlePreview}
            disabled={selectedCount === 0 || isPreviewing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
          >
            {isPreviewing ? labels.previewing : labels.previewSelected}
          </button>
        </div>

        {previewError ? (
          <p className="mt-3 text-xs text-rose-600">{previewError}</p>
        ) : null}

        {preview ? (
          <div className="mt-4 grid gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-white p-3">
                <div className="text-lg font-semibold text-stone-950">
                  {preview.sourceCount}
                </div>
                <div className="text-[10px] font-semibold uppercase text-stone-400">
                  {labels.sourcesChecked}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-lg font-semibold text-stone-950">
                  {preview.candidateItemCount}
                </div>
                <div className="text-[10px] font-semibold uppercase text-stone-400">
                  {labels.itemsFound}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-lg font-semibold text-emerald-700">
                  {preview.acceptedItemCount}
                </div>
                <div className="text-[10px] font-semibold uppercase text-stone-400">
                  {labels.briefReady}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-lg font-semibold text-rose-700">
                  {preview.rejectedItemCount}
                </div>
                <div className="text-[10px] font-semibold uppercase text-stone-400">
                  {labels.filtered}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              {preview.acceptedItems.slice(0, 3).map((item) => (
                <div
                  key={`${item.sourceTitle}:${item.canonicalUrl}`}
                  className="rounded-xl border border-emerald-100 bg-white p-3"
                >
                  <div className="text-xs font-semibold text-stone-900">
                    {item.title}
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-700">
                    {labels.briefReady} · {Math.round((item.relevanceScore ?? 0) * 100)}% ·{" "}
                    {item.relevanceReason}
                  </div>
                </div>
              ))}
              {preview.rejectedItems.slice(0, 3).map((item) => (
                <div
                  key={`${item.sourceTitle}:${item.canonicalUrl}`}
                  className="rounded-xl border border-stone-100 bg-white p-3"
                >
                  <div className="text-xs font-semibold text-stone-700">
                    {item.title}
                  </div>
                  <div className="mt-1 text-[11px] text-stone-500">
                    {labels.filtered} · {item.qualityError ?? item.relevanceReason}
                  </div>
                </div>
              ))}
              {preview.sourceErrors.map((error) => (
                <div
                  key={`${error.sourceTitle}:${error.error}`}
                  className="rounded-xl border border-amber-100 bg-white p-3 text-[11px] text-amber-700"
                >
                  {error.sourceTitle}: {error.error}
                </div>
              ))}
            </div>

            <div className="text-[11px] text-stone-500">
              {labels.recommendedCadence.replace(
                "{minutes}",
                String(preview.recommendedSyncIntervalMinutes),
              )} · {labels.notificationLevel.replace(
                "{level}",
                preview.recommendedNotificationLevel,
              )}
            </div>
          </div>
        ) : null}
      </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {step !== "select" ? (
          <button
            type="button"
            onClick={() => setStep(step === "confirm" ? "preview" : "select")}
            className="h-12 rounded-2xl border border-stone-200 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            {step === "confirm" ? labels.previewTitle : labels.sourcesInBundle}
          </button>
        ) : null}
        {step === "confirm" ? (
          <button
            onClick={handleSubscribe}
            disabled={selectedCount === 0 || isPending || !preview}
            className={`h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold transition ${
              selectedCount > 0 && !isPending && preview
                ? "bg-[#0057ff] text-white hover:bg-[#0049d6]"
                : "bg-stone-100 text-stone-400 cursor-not-allowed"
            }`}
          >
            {isPending ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-stone-850" />
                {labels.confirming}
              </>
            ) : (
              <>
                {labels.confirm
                  .replace("{count}", String(selectedCount))
                  .replace("{s}", selectedCount !== 1 ? "s" : "")}
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
