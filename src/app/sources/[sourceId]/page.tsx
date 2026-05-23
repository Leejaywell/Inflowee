import Link from "next/link";
import { notFound } from "next/navigation";

import { assertSourceAccess, requireSessionActor } from "@/lib/auth";
import { extractPageDiagnostics } from "@/lib/page-extract";
import { fetchSourceFeed } from "@/lib/source-sync";
import {
  defaultStore,
  getSourceById,
  listRecentSyncRunsBySource,
} from "@/lib/store";
import { extractStructuredListDiagnostics } from "@/lib/structured-extract";
import { extractTelegramPublicDiagnostics } from "@/lib/telegram-extract";

export const dynamic = "force-dynamic";

export default async function SourceDiagnosticsPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const actor = await requireSessionActor();
  const { sourceId } = await params;
  const source = await getSourceById(defaultStore, sourceId);

  if (!source) {
    notFound();
  }

  try {
    await assertSourceAccess(defaultStore, {
      actorId: actor.id,
      sourceId,
      minimumRole: "viewer",
    });
  } catch {
    notFound();
  }

  const recentRuns = await listRecentSyncRunsBySource(defaultStore, sourceId, 6);

  let diagnostics:
    | {
        title: string;
        summary: string | null;
        warnings: string[];
        preview: string;
      }
    | null = null;
  let diagnosticsError: string | null = null;

  if (
    source.sourceType === "PAGE" ||
    source.sourceType === "STRUCTURED" ||
    source.sourceType === "TELEGRAM_PUBLIC"
  ) {
    try {
      const html = await fetchSourceFeed(source.url, {
        signal: AbortSignal.timeout(10_000),
      });

      if (source.sourceType === "PAGE") {
        const result = extractPageDiagnostics(html, source.url);
        diagnostics = {
          title: result.title,
          summary: result.summary,
          warnings: result.warnings,
          preview: result.rawPreviewText,
        };
      } else {
        const result =
          source.sourceType === "STRUCTURED"
            ? await extractStructuredListDiagnostics(html, source.url)
            : extractTelegramPublicDiagnostics(html, source.url);
        diagnostics = {
          title:
            source.sourceType === "STRUCTURED"
              ? `${result.items.length} extracted list items`
              : `${result.items.length} extracted telegram messages`,
          summary: result.items[0]?.summary ?? null,
          warnings: result.warnings,
          preview: result.rawPreviewHtml,
        };
      }
    } catch (error) {
      diagnosticsError =
        error instanceof Error ? error.message : "Unknown diagnostics failure.";
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Link href="/sources" className="hover:text-stone-700">
              ← Sources
            </Link>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
              Diagnostics
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {source.title}
          </h1>
          <p className="max-w-3xl break-all text-sm leading-6 text-stone-600">
            {source.url}
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="text-lg font-semibold">Source state</h2>
          <div className="mt-4 grid gap-3 text-sm text-stone-600">
            <div>Type: {source.sourceType}</div>
            <div>Status: {source.status}</div>
            <div>
              Last synced: {source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : "Never"}
            </div>
            <div>Next sync: {source.nextSyncAt ? new Date(source.nextSyncAt).toLocaleString() : "Unscheduled"}</div>
            {source.lastError ? <div>Error: {source.lastError}</div> : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="text-lg font-semibold">Extraction diagnostics</h2>
          {source.sourceType !== "PAGE" &&
          source.sourceType !== "STRUCTURED" &&
          source.sourceType !== "TELEGRAM_PUBLIC" ? (
            <p className="mt-4 text-sm text-stone-500">
              Diagnostics preview is currently available for PAGE, STRUCTURED, and TELEGRAM_PUBLIC sources.
            </p>
          ) : diagnosticsError ? (
            <p className="mt-4 text-sm text-rose-600">{diagnosticsError}</p>
          ) : diagnostics ? (
            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-sm font-medium text-stone-900">{diagnostics.title}</div>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {diagnostics.summary ?? "No summary extracted."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {diagnostics.warnings.length === 0 ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    No extraction warnings
                  </span>
                ) : (
                  diagnostics.warnings.map((warning) => (
                    <span
                      key={warning}
                      className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700"
                    >
                      {warning}
                    </span>
                  ))
                )}
              </div>
              <pre className="overflow-x-auto rounded-2xl bg-stone-950 p-4 text-xs leading-6 text-stone-200">
                {diagnostics.preview || "No preview available."}
              </pre>
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">No diagnostics available.</p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
        <h2 className="text-lg font-semibold">Recent runs</h2>
        <div className="mt-4 grid gap-3">
          {recentRuns.length === 0 ? (
            <p className="text-sm text-stone-500">No sync runs recorded yet.</p>
          ) : (
            recentRuns.map((run) => (
              <div
                key={run.id}
                className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium text-stone-900">{run.status}</span>
                  <span>{new Date(run.startedAt).toLocaleString()}</span>
                </div>
                <div className="mt-2 text-xs text-stone-500">
                  {run.insertedItemCount} items · {run.createdBriefCount} briefs
                  {run.error ? ` · ${run.error}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
