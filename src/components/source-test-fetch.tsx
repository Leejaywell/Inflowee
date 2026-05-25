"use client";

import { useState, useTransition } from "react";
import { testSourceFetchAction } from "@/app/actions";

type TestFetchResult = {
  ok: boolean;
  items?: Array<{ title: string; canonicalUrl: string; publishedAt: string | null }>;
  error?: string;
};

export function SourceTestFetch({ isZh }: { isZh: boolean }) {
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState("RSS");
  const [result, setResult] = useState<TestFetchResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTest() {
    if (!url.trim()) return;
    startTransition(async () => {
      const res = await testSourceFetchAction(url.trim(), sourceType);
      setResult(res);
    });
  }

  return (
    <div className="rounded-[24px] border border-stone-900/10 bg-white p-5 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
      <div className="mb-4 space-y-0.5">
        <h2 className="text-base font-semibold">
          {isZh ? "测试抓取" : "Test fetch"}
        </h2>
        <p className="text-xs leading-5 text-stone-500">
          {isZh
            ? "输入 RSS/Atom URL 预览内容，确认来源是否有效。"
            : "Enter an RSS/Atom URL to preview content and confirm the source works."}
        </p>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {isZh ? "类型" : "Type"}
          </span>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
          >
            <option value="RSS">RSS Feed</option>
            <option value="PAGE">Web Page</option>
            <option value="STRUCTURED">Structured List</option>
            <option value="UPDATE">Update Feed</option>
            <option value="NEWSLETTER">Newsletter Archive</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            URL
          </span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>

        <button
          onClick={handleTest}
          disabled={isPending || !url.trim()}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
        >
          {isPending
            ? isZh
              ? "抓取中…"
              : "Fetching…"
            : isZh
              ? "测试抓取"
              : "Test fetch"}
        </button>

        {result && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {result.ok ? (
              result.items && result.items.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]">
                    {isZh ? `找到 ${result.items.length} 条内容` : `Found ${result.items.length} items`}
                  </p>
                  <ul className="grid gap-1.5">
                    {result.items.map((item, i) => (
                      <li key={i} className="text-xs">
                        <a
                          href={item.canonicalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                        >
                          {item.title || item.canonicalUrl}
                        </a>
                        {item.publishedAt && (
                          <span className="ml-2 text-emerald-600">
                            {new Date(item.publishedAt).toLocaleDateString()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>{isZh ? "来源有效，但未找到内容。" : "Source is valid but no items found."}</p>
              )
            ) : (
              <p>{result.error ?? (isZh ? "抓取失败。" : "Fetch failed.")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
