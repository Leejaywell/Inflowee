import Link from "next/link";

import { defaultStore, listBriefs } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const briefs = listBriefs(defaultStore);

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <div className="space-y-3">
          <span className="inline-flex rounded-full bg-[#0057ff] px-3 py-1 text-xs font-medium tracking-[0.18em] text-white uppercase">
            Brief inbox
          </span>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Brief inbox
            </h1>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
              AI-ready brief objects rendered from stored feed items.
            </p>
          </div>
        </div>
      </section>

      {briefs.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-stone-200 bg-white px-6 py-10 text-sm text-stone-500 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
          No briefs yet. Sync a source from the Sources page.
        </section>
      ) : (
        <section className="grid gap-4">
          {briefs.map((brief) => (
            <article
              key={brief.id}
              className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
                    {brief.spaceName} / {brief.taskTitle}
                  </p>
                  <h2 className="text-2xl font-semibold text-stone-950">
                    <Link
                      href={`/inbox/${brief.id}`}
                      className="transition hover:text-[#0057ff]"
                    >
                      {brief.title}
                    </Link>
                  </h2>
                </div>

                <Link
                  href={`/inbox/${brief.id}/html`}
                  className="inline-flex h-10 items-center rounded-full bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800"
                >
                  HTML view
                </Link>
              </div>

              <p className="mt-4 text-sm leading-7 text-stone-700">
                {brief.summary}
              </p>

              <div className="mt-4 rounded-[20px] bg-stone-50 px-4 py-4">
                <div className="text-sm font-medium text-stone-950">
                  Why it matters
                </div>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  {brief.whyItMatters}
                </p>
              </div>

              <ul className="mt-4 grid gap-2 text-sm text-stone-500">
                {brief.sourceCitations.map((citation) => (
                  <li key={citation}>
                    <a
                      href={citation}
                      className="underline decoration-stone-300 underline-offset-4"
                    >
                      {citation}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
