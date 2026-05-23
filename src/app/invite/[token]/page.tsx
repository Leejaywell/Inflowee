import { notFound } from "next/navigation";

import { acceptSpaceInviteAction } from "@/app/actions";
import { getSessionUser } from "@/lib/auth";
import { defaultStore, getSpaceById, getSpaceInviteByToken } from "@/lib/store";

type InvitePageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string }>;
};

export default async function InvitePage({
  params,
  searchParams,
}: InvitePageProps) {
  const actor = await getSessionUser().catch(() => null);
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const invite = await getSpaceInviteByToken(defaultStore, token);

  if (!invite) {
    notFound();
  }

  const space = await getSpaceById(defaultStore, invite.spaceId);

  if (!space) {
    notFound();
  }

  const error = query?.error;
  const canAccept = !invite.acceptedAt && !invite.revokedAt;

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <span className="inline-flex w-fit rounded-full bg-stone-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white">
          Space invite
        </span>
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
            Join {space.name}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
            This invite grants <span className="font-medium text-stone-900">{invite.role}</span> access
            {actor
              ? ` for the current actor: ${actor.email}.`
              : " after you confirm the email address that should receive this session."}
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {decodeURIComponent(error)}
          </div>
        ) : null}

        {canAccept ? (
          <form action={acceptSpaceInviteAction} className="grid gap-3 rounded-[24px] border border-stone-200 bg-stone-50 p-6">
            <input type="hidden" name="token" value={token} />
            {!actor ? (
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-stone-700">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="teammate@example.com"
                  className="h-12 rounded-2xl border border-stone-200 bg-white px-4 outline-none transition focus:border-stone-400"
                />
              </label>
            ) : null}
            <div className="text-sm text-stone-600">
              Created by <span className="font-medium text-stone-900">{invite.createdBy}</span>
            </div>
            <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
              Accept invite
            </button>
          </form>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 text-sm text-stone-600">
            {invite.acceptedAt
              ? `This invite was already accepted by ${invite.acceptedBy}.`
              : "This invite has been revoked."}
          </div>
        )}
      </section>
    </div>
  );
}
