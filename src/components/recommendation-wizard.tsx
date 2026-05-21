"use client";

import { useState, useTransition } from "react";
import { refreshStoredTaskIntelligence } from "@/app/actions";
import { subscribeRecommendedSources } from "@/app/actions-chat";
import { SourceBundle, SourceRecommendation, TaskProfile } from "@/lib/ai";

type RecommendationWizardProps = {
  taskId: string;
  taskProfile: TaskProfile | null;
  recommendedBundles: SourceBundle[];
};

type SelectedSource = {
  title: string;
  url: string;
  sourceType: "RSS" | "PAGE" | "STRUCTURED";
};

export function RecommendationWizard({
  taskId,
  taskProfile,
  recommendedBundles,
}: RecommendationWizardProps) {
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
  const [success, setSuccess] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
    if (list.length === 0) return;

    setSuccess(false);
    startTransition(async () => {
      try {
        await subscribeRecommendedSources(taskId, list);
        setSuccess(true);
        // Clear selection map after subscribing
        setSelectedMap({});
      } catch (err) {
        console.error("Failed to subscribe sources:", err);
      }
    });
  };

  const handleRefresh = () => {
    setRefreshError(null);
    startRefreshTransition(async () => {
      try {
        await refreshStoredTaskIntelligence(taskId);
      } catch (error) {
        setRefreshError(
          error instanceof Error
            ? error.message
            : "Unable to refresh recommendations right now.",
        );
      }
    });
  };

  const selectedCount = Object.keys(selectedMap).length;

  if (recommendedBundles.length === 0) {
    return (
      <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)] text-center py-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-stone-500 font-medium">
              {taskProfile
                ? "No stored recommendations are available for this task yet."
                : "This task has no stored intelligence yet."}
            </p>
            {taskProfile ? (
              <p className="text-xs text-stone-400">
                Refresh to regenerate source bundles from the saved task profile.
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
            {isRefreshing ? "Refreshing intelligence..." : "Refresh intelligence"}
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
          <h3 className="text-xl font-semibold text-stone-950">Subscribed successfully!</h3>
          <p className="text-sm text-stone-500 max-w-sm mx-auto leading-normal">
            Your new intelligence channels are set up. Run synchronization from the Sources tab to fetch raw updates.
          </p>
        </div>
        <button
          onClick={() => setSuccess(false)}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-950 px-4 text-xs font-semibold text-stone-50 transition hover:bg-stone-800"
        >
          View feed channels
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)] space-y-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-stone-950">AI Recommendation Wizard</h2>
            <p className="text-xs text-stone-500 mt-1">
              Select curated streams recommended specifically for this task query.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 px-3 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
          >
            {isRefreshing ? "Refreshing..." : "Refresh intelligence"}
          </button>
        </div>
        {refreshError ? (
          <p className="mt-2 text-xs text-rose-600">{refreshError}</p>
        ) : null}
      </div>

      <div className="space-y-6">
        {recommendedBundles.map((bundle, bIdx) => (
          <div
            key={bIdx}
            className="rounded-2xl border border-stone-200 bg-stone-50/50 p-5 space-y-4"
          >
            <div>
              <span className="inline-flex rounded-full bg-[#0057ff]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0057ff] uppercase">
                Bundle recommendation
              </span>
              <h3 className="text-lg font-bold text-stone-950 mt-1.5">{bundle.title}</h3>
              <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                {bundle.description}
              </p>
            </div>

            {/* Rationale Quote */}
            <div className="rounded-xl bg-[#f7f1e9]/60 border border-[#f7f1e9] p-4 text-xs text-stone-600 leading-relaxed italic flex gap-2.5 items-start">
              <span className="text-lg font-serif text-stone-400 select-none">“</span>
              <div>
                <span className="font-semibold text-stone-700 not-italic block mb-0.5">
                  AI Rationale
                </span>
                {bundle.rationale}
              </div>
            </div>

            {/* Recommendations checklist */}
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                SOURCES IN BUNDLE
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
                        onChange={() => toggleSource(src)}
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
      </div>

      {/* Subscribe Button */}
      <button
        onClick={handleSubscribe}
        disabled={selectedCount === 0 || isPending}
        className={`w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold transition ${
          selectedCount > 0 && !isPending
            ? "bg-[#0057ff] text-white hover:bg-[#0049d6]"
            : "bg-stone-100 text-stone-400 cursor-not-allowed"
        }`}
      >
        {isPending ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-stone-850" />
            Subscribing channels...
          </>
        ) : (
          <>
            Subscribe {selectedCount} Channel{selectedCount !== 1 ? "s" : ""}
          </>
        )}
      </button>
    </div>
  );
}
