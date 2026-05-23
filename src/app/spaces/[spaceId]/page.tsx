import Link from "next/link";
import { notFound } from "next/navigation";

import {
  removeSpaceMemberAction,
  upsertSpaceMemberAction,
} from "@/app/actions";
import { ChatConsole } from "@/components/chat-console";
import { MemberList } from "@/components/member-list";
import {
  assertSpaceAccess,
  getActorScopedChatScopeId,
  requireSessionActor,
} from "@/lib/auth";
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
  searchParams?: Promise<{ updated?: string; error?: string }>;
};

export default async function SpaceDetailPage({ params, searchParams }: SpacePageProps) {
  const { spaceId } = await params;
  const store = defaultStore;
  const actor = await requireSessionActor();

  // 1. Fetch space
  const space = await getSpaceById(store, spaceId);

  if (!space) {
    notFound();
  }

  try {
    await assertSpaceAccess(store, {
      actorId: actor.id,
      spaceId,
      minimumRole: "viewer",
    });
  } catch {
    notFound();
  }

  // 2. Fetch tasks within the space
  const tasks = await listTasksBySpace(store, spaceId);
  const members = await listSpaceMembers(store, spaceId);
  const query = await searchParams;
  const ownerMember = {
    spaceId,
    userId: space.ownerId,
    role: "owner" as const,
    createdAt: space.createdAt,
  };
  const effectiveMembers = [
    ownerMember,
    ...members.filter((member) => member.userId !== space.ownerId),
  ];
  const canManageMembers = actor.id === space.ownerId;

  // 3. Fetch aggregated briefs in this space
  const { briefs } = await getGroundingForScope(store, "space", spaceId, {
    includeItems: false,
  });

  // 4. Fetch Chat history
  const actorScopeId = getActorScopedChatScopeId(actor.id, spaceId);
  const chatThread = await getOrCreateChatThread(store, "space", actorScopeId);
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
            <MemberList actorId={actor.id} members={effectiveMembers} />
            {canManageMembers ? (
              <div className="mt-5 grid gap-4 border-t border-stone-100 pt-5">
                <form action={upsertSpaceMemberAction} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                  <input type="hidden" name="spaceId" value={spaceId} />
                  <input
                    name="userId"
                    placeholder="user-2 or teammate@example.com"
                    className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                  />
                  <select
                    name="role"
                    defaultValue="viewer"
                    className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </select>
                  <button className="inline-flex h-11 items-center justify-center rounded-xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
                    Add or update member
                  </button>
                </form>
                {effectiveMembers.filter((member) => member.role !== "owner").length > 0 ? (
                  <div className="grid gap-2">
                    {effectiveMembers
                      .filter((member) => member.role !== "owner")
                      .map((member) => (
                        <form
                          key={`remove:${member.spaceId}:${member.userId}`}
                          action={removeSpaceMemberAction}
                          className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
                        >
                          <input type="hidden" name="spaceId" value={spaceId} />
                          <input type="hidden" name="userId" value={member.userId} />
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-stone-900">{member.userId}</span>
                            <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs text-stone-700">
                              {member.role}
                            </span>
                          </div>
                          <button className="inline-flex h-9 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-100">
                            Remove
                          </button>
                        </form>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {query?.error || query?.updated ? (
            <div
              className={`rounded-2xl border px-5 py-4 text-sm ${
                query.error
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {query.error
                ? decodeURIComponent(query.error)
                : "Space membership updated."}
            </div>
          ) : null}
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
