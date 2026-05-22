import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatConsole } from "@/components/chat-console";
import { MemberList } from "@/components/member-list";
import { getGroundingForScope } from "@/lib/grounding";
import {
  defaultStore,
  getSpaceById,
  getOrCreateChatThread,
  listChatMessages,
  listSpaceMembers,
  listTasksBySpace,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type SpacePageProps = {
  params: Promise<{ spaceId: string }>;
};

export default async function SpaceDetailPage({ params }: SpacePageProps) {
  const { spaceId } = await params;
  const store = defaultStore;

  // 1. Fetch space
  const space = await getSpaceById(store, spaceId);

  if (!space) {
    notFound();
  }

  // 2. Fetch tasks within the space
  const tasks = await listTasksBySpace(store, spaceId);
  const members = await listSpaceMembers(store, spaceId);
  const effectiveMembers =
    members.length > 0
      ? members
      : [
          {
            spaceId,
            userId: space.ownerId,
            role: "owner",
            createdAt: space.createdAt,
          },
        ];

  // 3. Fetch aggregated briefs in this space
  const { briefs } = await getGroundingForScope(store, "space", spaceId, {
    includeItems: false,
  });

  // 4. Fetch Chat history
  const chatThread = await getOrCreateChatThread(store, "space", spaceId);
  const chatMessages = await listChatMessages(store, chatThread.id);

  return (
    <div className="grid gap-6">
      {/* Header bar */}
      <section className="rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Link href="/" className="hover:text-stone-700">
              ← Dashboard
            </Link>
            <span className="text-stone-300">/</span>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">
              Space details
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
              {space.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-stone-600 sm:text-lg">
              {space.description || "No description provided."}
            </p>
          </div>

          <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <h2 className="text-xl font-semibold text-stone-950 border-b border-stone-100 pb-4 mb-4">
              Space members
            </h2>
            <MemberList members={effectiveMembers} />
          </div>
        </div>
      </section>

      {/* Main split grid */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column: Feed & Tasks */}
        <div className="space-y-6">
          {/* Aggregated Brief Inbox */}
          <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
              <h2 className="text-xl font-semibold text-stone-950">Space feed</h2>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                {briefs.length} brief{briefs.length !== 1 ? "s" : ""}
              </span>
            </div>

            {briefs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
                No synthesized briefs yet for this space. Run synchronization on attached sources to ingest content.
              </div>
            ) : (
              <div className="space-y-4">
                {briefs.map((brief) => (
                  <article
                    key={brief.id}
                    className={`rounded-2xl border border-stone-200 bg-stone-50/50 p-5 hover:bg-stone-50 transition`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
                          {brief.taskTitle}
                        </span>
                        {!brief.isRead && (
                          <span className="h-2 w-2 rounded-full bg-[#0057ff]" />
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-stone-950 hover:text-[#0057ff]">
                        <Link href={`/inbox/${brief.id}`}>{brief.title}</Link>
                      </h3>
                      <p className="text-sm text-stone-600 line-clamp-3 leading-relaxed">
                        {brief.summary}
                      </p>
                      <div className="pt-2 flex items-center justify-between text-xs text-stone-400">
                        <span>
                          {new Date(brief.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <Link
                          href={`/inbox/${brief.id}`}
                          className="font-medium text-[#0057ff] hover:underline"
                        >
                          Read full →
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Connected Tasks list */}
          <div className="rounded-[24px] border border-stone-900/10 bg-white p-6 shadow-[0_16px_50px_rgba(33,24,9,0.06)]">
            <h2 className="text-xl font-semibold text-stone-950 border-b border-stone-100 pb-4 mb-4">
              Space monitoring tasks
            </h2>

            {tasks.length === 0 ? (
              <div className="text-sm text-stone-500 py-4">
                No tasks attached to this space. Add tasks on the Dashboard page.
              </div>
            ) : (
              <div className="grid gap-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-stone-100 bg-stone-50/50 p-4 transition hover:bg-stone-50"
                  >
                    <div>
                      <h4 className="font-bold text-stone-900 hover:text-[#0057ff]">
                        <Link href={`/spaces/${spaceId}/tasks/${task.id}`}>
                          {task.title}
                        </Link>
                      </h4>
                      <p className="text-xs text-stone-500 mt-1 truncate max-w-xs sm:max-w-md">
                        {task.userPrompt}
                      </p>
                    </div>

                    <Link
                      href={`/spaces/${spaceId}/tasks/${task.id}`}
                      className="inline-flex h-8 items-center rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white transition hover:bg-stone-800"
                    >
                      View task
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Grounded Space Chat */}
        <div>
          <ChatConsole
            scopeType="space"
            scopeId={spaceId}
            initialMessages={chatMessages}
            title={`${space.name} Assistant`}
            subtitle={`Answers grounded purely in items & briefs inside this Space.`}
          />
        </div>
      </div>
    </div>
  );
}
