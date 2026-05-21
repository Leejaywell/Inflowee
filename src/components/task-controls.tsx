"use client";

import { useState, useTransition } from "react";
import { updateTaskControlSettings } from "@/app/actions-chat";

type TaskControlsProps = {
  taskId: string;
  initialRelevanceLevel: number;
  initialSummaryPreference: string;
};

export function TaskControls({
  taskId,
  initialRelevanceLevel,
  initialSummaryPreference,
}: TaskControlsProps) {
  const [relevance, setRelevance] = useState(initialRelevanceLevel);
  const [pref, setPref] = useState(initialSummaryPreference);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleSave = (newRelevance: number, newPref: string) => {
    setSaved(false);
    startTransition(async () => {
      try {
        await updateTaskControlSettings(taskId, newRelevance, newPref);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        console.error("Failed to update task controls:", err);
      }
    });
  };

  return (
    <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)] space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-stone-950">AI Feed Controller</h2>
        <p className="text-xs text-stone-500 mt-1">
          Adjust relevance thresholds and synthesis density dynamically.
        </p>
      </div>

      <div className="space-y-5">
        {/* Relevance Level Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-stone-700">Relevance Level Threshold</span>
            <span className="font-bold text-stone-950">Level {relevance} / 5</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={relevance}
            onChange={(e) => {
              const val = Number(e.target.value);
              setRelevance(val);
              handleSave(val, pref);
            }}
            className="w-full h-2 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-stone-950"
          />
          <div className="flex justify-between text-[10px] text-stone-400 font-medium">
            <span>Level 1 (All updates)</span>
            <span>Level 3 (Balanced)</span>
            <span>Level 5 (Highly Critical Only)</span>
          </div>
        </div>

        {/* Summary Preference Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700 block">
            AI Synthesis Density
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "brief", label: "Brief Summary", desc: "Short nuggets" },
              { value: "balanced", label: "Balanced", desc: "Medium digest" },
              { value: "comprehensive", label: "Deep Dive", desc: "Dense analysis" },
            ].map((opt) => {
              const active = pref === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setPref(opt.value);
                    handleSave(relevance, opt.value);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition ${
                    active
                      ? "bg-stone-950 border-stone-950 text-white shadow-sm"
                      : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100 hover:border-stone-300"
                  }`}
                >
                  <span className="text-sm font-semibold block">{opt.label}</span>
                  <span
                    className={`text-[9px] mt-0.5 font-medium ${
                      active ? "text-stone-300" : "text-stone-400"
                    }`}
                  >
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Auto-saved Feedback */}
      <div className="flex items-center justify-between text-xs pt-2">
        <span className="text-stone-400 font-medium">
          {isPending ? "Syncing settings..." : "Settings auto-save on adjust"}
        </span>
        {saved && (
          <span className="text-emerald-600 font-semibold flex items-center gap-1 animate-fade-in">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
            Controls updated
          </span>
        )}
      </div>
    </div>
  );
}
