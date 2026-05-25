"use client";

import { useState } from "react";
import { createSource } from "@/app/actions";
import type { DiscoveryCategory } from "@/lib/discovery-catalog";

type AddSourceFormProps = {
  categoryOptions: DiscoveryCategory[];
  isZh: boolean;
  labels: {
    addSource: string;
    addSourceDescription: string;
    sourceType: string;
    sourceTitle: string;
    feedUrl: string;
    telegramHelp: string;
    saveSource: string;
  };
};

export function AddSourceForm({ categoryOptions, isZh, labels }: AddSourceFormProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["all"]);
  const [tags, setTags] = useState("");

  function toggleCategory(id: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((c) => c !== id) : prev;
      }
      return [...prev, id];
    });
  }

  return (
    <form
      action={createSource}
      className="rounded-[24px] border border-stone-900/10 bg-white p-5 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
    >
      <div className="mb-4 space-y-0.5">
        <h2 className="text-base font-semibold">{labels.addSource}</h2>
        <p className="text-xs leading-5 text-stone-500">{labels.addSourceDescription}</p>
      </div>

      <div className="grid gap-3">
        {/* Multi-select categories */}
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {isZh ? "分类（必选）" : "Categories (required)"}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {categoryOptions.map((category) => {
              const active = selectedCategories.includes(category.id);
              return (
                <label
                  key={category.id}
                  className={`inline-flex cursor-pointer items-center rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-[#0057ff] bg-[#0057ff]/10 text-[#0057ff]"
                      : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="categories"
                    value={category.id}
                    checked={active}
                    onChange={() => toggleCategory(category.id)}
                    className="sr-only"
                  />
                  {category.title}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Optional tags */}
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {isZh ? "标签（可选，逗号分隔）" : "Tags (optional, comma-separated)"}
          </span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={isZh ? "AI, 研究, 开源" : "AI, research, open-source"}
            className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
          />
          {tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((tag) => (
              <input key={tag} type="hidden" name="tags" value={tag} />
            ))}
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {labels.sourceType}
          </span>
          <select
            name="sourceType"
            className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
            defaultValue="RSS"
          >
            <option value="RSS">RSS Feed</option>
            <option value="PAGE">Web Page</option>
            <option value="STRUCTURED">Structured List</option>
            <option value="UPDATE">Update Feed</option>
            <option value="NEWSLETTER">Newsletter Archive</option>
            <option value="TELEGRAM_PUBLIC">Telegram Public Feed</option>
            <option value="TELEGRAM_BOT">Telegram Bot Feed</option>
            <option value="HOTLIST_DISCOVERY">Hotlist Discovery</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {labels.sourceTitle}
          </span>
          <input
            name="title"
            placeholder="OpenAI Blog RSS"
            className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {labels.feedUrl}
          </span>
          <input
            name="url"
            placeholder="https://example.com/feed.xml"
            className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>

        <p className="text-xs leading-5 text-stone-400">{labels.telegramHelp}</p>

        <button className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0057ff] px-4 text-sm font-medium text-white transition hover:bg-[#0049d6]">
          {labels.saveSource}
        </button>
      </div>
    </form>
  );
}
