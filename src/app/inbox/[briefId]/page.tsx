import Link from "next/link";
import { notFound } from "next/navigation";

import { sendBriefToWebhook } from "@/app/actions";
import { ChatDrawer } from "@/components/chat-drawer";
import {
  defaultStore,
  getBriefById,
  getWebhookSettings,
  listBriefItemIds,
  listRecentDeliveryLogsByBrief,
  listItemsByBriefId,
  getOrCreateChatThread,
  listChatMessages,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BriefDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ briefId: string }>;
  searchParams?: Promise<{ delivered?: string; error?: string }>;
}) {
  const [{ briefId }, query] = await Promise.all([params, searchParams]);
  const brief = await getBriefById(defaultStore, briefId);

  if (!brief) {
    notFound();
  }

  const [itemIds, linkedItems, chatThread, webhookSettings, deliveryLogs] =
    await Promise.all([
      listBriefItemIds(defaultStore, briefId),
      listItemsByBriefId(defaultStore, briefId),
      getOrCreateChatThread(defaultStore, "brief", briefId),
      getWebhookSettings(defaultStore),
      listRecentDeliveryLogsByBrief(defaultStore, briefId),
    ]);
  const chatMessages = await listChatMessages(defaultStore, chatThread.id);
  const delivered = query?.delivered;
  const error = query?.error;

  return (
    <div className="grid gap-6">
      {(delivered || error) && (
        <section
          className={`rounded-2xl border px-5 py-4 text-sm ${
            error
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error
            ? decodeURIComponent(error)
            : delivered === "webhook"
              ? "Brief delivered to webhook."
              : "Update applied."}
        </section>
      )}

      <section className="rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Link href="/inbox" className="hover:text-stone-700">
              ← Inbox
            </Link>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
              {brief.spaceName} / {brief.taskTitle}
            </span>
          </div>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {brief.title}
          </h1>

          <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
            {brief.summary}
          </p>

          <div className="rounded-[20px] bg-stone-50 px-5 py-5">
            <div className="text-sm font-semibold text-stone-950">
              Why it matters
            </div>
            <p className="mt-2 text-sm leading-7 text-stone-600">
              {brief.whyItMatters}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
              {brief.importanceScore >= 0.75 ? "Important" : "Signal"}
            </span>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-500">
              Relevance {Math.round(brief.relevanceScore * 100)}%
            </span>
            {brief.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-stone-200 px-2.5 py-1 text-[11px] text-stone-600"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          <h2 className="text-lg font-semibold">Source citations</h2>
          <ul className="mt-4 grid gap-3">
            {brief.sourceCitations.map((citation) => (
              <li key={citation}>
                <a
                  href={citation}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl bg-stone-50 px-4 py-3 text-sm text-[#0057ff] underline decoration-stone-300 underline-offset-4 transition hover:bg-stone-100"
                >
                  {citation}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <h2 className="text-lg font-semibold">Linked items</h2>
            <p className="mt-2 text-sm text-stone-500">
              {itemIds.length} raw item{itemIds.length !== 1 ? "s" : ""} behind
              this brief.
            </p>
            <ul className="mt-4 grid gap-3">
              {linkedItems.map((item) => (
                <li key={item.id} className="rounded-2xl bg-stone-50 px-4 py-3">
                  <div className="text-sm font-medium text-stone-900">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    {item.canonicalUrl}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <h2 className="text-lg font-semibold">Actions</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/inbox/${briefId}/html`}
                className="inline-flex h-10 items-center rounded-full bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800"
              >
                HTML digest
              </Link>
              <Link
                href={`/inbox/${briefId}/image`}
                className="inline-flex h-10 items-center rounded-full border border-stone-200 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
              >
                Image card
              </Link>
              <form action={sendBriefToWebhook}>
                <input type="hidden" name="briefId" value={briefId} />
                <button
                  className="inline-flex h-10 items-center rounded-full border border-[#0057ff]/20 bg-[#0057ff]/10 px-4 text-sm font-medium text-[#0057ff] transition hover:bg-[#0057ff]/15"
                  disabled={!webhookSettings.endpoint}
                  title={
                    webhookSettings.endpoint
                      ? "Send this brief to the configured webhook."
                      : "Configure a webhook endpoint in Settings first."
                  }
                >
                  Send webhook
                </button>
              </form>
              <ChatDrawer
                briefId={briefId}
                briefTitle={brief.title}
                initialMessages={chatMessages}
              />
            </div>
            {!webhookSettings.endpoint ? (
              <p className="mt-3 text-sm text-stone-500">
                No webhook configured yet. Add one in{" "}
                <Link href="/settings" className="text-[#0057ff] underline">
                  Settings
                </Link>
                .
              </p>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <h2 className="text-lg font-semibold">Delivery logs</h2>
            <div className="mt-4 grid gap-3">
              {deliveryLogs.length === 0 ? (
                <p className="text-sm text-stone-500">
                  No webhook sends recorded for this brief yet.
                </p>
              ) : (
                deliveryLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl bg-stone-50 px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium text-stone-900">
                        {log.status}
                      </span>
                      <span className="text-xs text-stone-500">
                        {new Date(log.startedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-stone-500">
                      {log.responseStatus
                        ? `HTTP ${log.responseStatus}`
                        : "Pending response"}
                      {log.error ? ` · ${log.error}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-stone-900/10 bg-stone-950 p-6 text-stone-50 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-400">
              Created
            </p>
            <p className="mt-2 text-sm text-stone-300">
              {new Date(brief.createdAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
