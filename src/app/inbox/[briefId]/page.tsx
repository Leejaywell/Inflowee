import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatDrawer } from "@/components/chat-drawer";
import {
  defaultStore,
  getBriefById,
  listBriefItemIds,
  getOrCreateChatThread,
  listChatMessages,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BriefDetailPage({
  params,
}: {
  params: Promise<{ briefId: string }>;
}) {
  const { briefId } = await params;
  const brief = getBriefById(defaultStore, briefId);

  if (!brief) {
    notFound();
  }

  const itemIds = listBriefItemIds(defaultStore, briefId);
  const chatThread = getOrCreateChatThread(defaultStore, "brief", briefId);
  const chatMessages = listChatMessages(defaultStore, chatThread.id);

  return (
    <div className="grid gap-6">
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
              <ChatDrawer
                briefId={briefId}
                briefTitle={brief.title}
                initialMessages={chatMessages}
              />
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
