import { redirect } from "next/navigation";

import { signInAction } from "@/app/actions";
import {
  getSessionUser,
  hasConfiguredOperatorLogin,
} from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
    signedOut?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const actor = await getSessionUser().catch(() => null);
  const params = await searchParams;
  const error = params?.error;
  const next = params?.next?.startsWith("/") ? params.next : "/";

  if (actor) {
    redirect(next);
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <section className="grid gap-4 rounded-[28px] border border-stone-900/10 bg-white/80 p-8 shadow-[0_24px_80px_rgba(33,24,9,0.08)] backdrop-blur">
        <span className="inline-flex w-fit rounded-full bg-stone-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white">
          Sign in
        </span>
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
            Open the workspace
          </h1>
          <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
            Operator access uses a signed session cookie. Team members can join through invite links and receive their own session after acceptance.
          </p>
        </div>

        {params?.signedOut ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            Session cleared.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {decodeURIComponent(error)}
          </div>
        ) : null}

        {hasConfiguredOperatorLogin() ? (
          <form action={signInAction} className="grid gap-4 rounded-[24px] border border-stone-200 bg-stone-50 p-6">
            <input type="hidden" name="redirectTo" value={next} />
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">Operator email</span>
              <input
                name="email"
                type="email"
                required
                placeholder="owner@example.com"
                className="h-12 rounded-2xl border border-stone-200 bg-white px-4 outline-none transition focus:border-stone-400"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-stone-700">Access code</span>
              <input
                name="loginCode"
                type="password"
                required
                placeholder="Configured via INFLOWEE_OPERATOR_LOGIN_CODE"
                className="h-12 rounded-2xl border border-stone-200 bg-white px-4 outline-none transition focus:border-stone-400"
              />
            </label>
            <button className="inline-flex h-12 items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800">
              Sign in
            </button>
          </form>
        ) : (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            Operator login is not configured yet. Set <code>INFLOWEE_SESSION_SECRET</code>, <code>INFLOWEE_OPERATOR_EMAIL</code>, and <code>INFLOWEE_OPERATOR_LOGIN_CODE</code> before using browser-based authentication.
          </div>
        )}
      </section>
    </div>
  );
}
