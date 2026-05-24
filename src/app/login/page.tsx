import { redirect } from "next/navigation";

import { signInAction } from "@/app/actions";
import {
  getSessionUser,
  hasConfiguredOperatorLogin,
} from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n-server";
import { getConfiguredOAuthProviders } from "@/lib/oauth";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
    signedOut?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [actor, locale] = await Promise.all([
    getSessionUser().catch(() => null),
    getRequestLocale(),
  ]);
  const t = getDictionary(locale).login;
  const params = await searchParams;
  const error = params?.error;
  const next = params?.next?.startsWith("/") ? params.next : "/";
  const oauthProviders = getConfiguredOAuthProviders();
  const hasOAuthProvider = oauthProviders.some((provider) => provider.configured);

  if (actor) {
    redirect(next);
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <section className="grid gap-5 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] p-8">
        <span className="inline-flex w-fit rounded-full bg-[var(--app-accent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-accent-ink)]">
          {t.badge}
        </span>
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--app-ink)] sm:text-5xl">
            {t.title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-[var(--app-muted)] sm:text-lg">
            {t.description}
          </p>
        </div>

        {params?.signedOut ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
            {t.signedOut}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {decodeURIComponent(error)}
          </div>
        ) : null}

        <div className="grid gap-3 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface-alt)] p-6">
          <div>
            <h2 className="text-sm font-semibold text-[var(--app-ink)]">
              {t.accountTitle}
            </h2>
            <p className="mt-1 text-xs text-[var(--app-muted)]">
              {t.accountDescription}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {oauthProviders.map((provider) =>
              provider.configured ? (
                <a
                  key={provider.provider}
                  href={`/api/auth/${provider.provider}/start?next=${encodeURIComponent(next)}`}
                  className="inline-flex h-11 items-center justify-center rounded-[calc(var(--app-radius)-6px)] border border-[color:var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-semibold text-[var(--app-ink)] transition hover:border-[color:var(--app-accent)] hover:bg-[var(--app-surface)]"
                >
                  {provider.label}
                </a>
              ) : (
                <button
                  key={provider.provider}
                  type="button"
                  disabled
                  className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-[calc(var(--app-radius)-6px)] border border-[color:var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-semibold text-[var(--app-muted)] opacity-65"
                  title={`${provider.label} OAuth credentials are not configured.`}
                >
                  {provider.label}
                </button>
              ),
            )}
          </div>
          {!hasOAuthProvider ? (
            <p className="text-xs text-amber-700">
              {t.configureOAuth}
            </p>
          ) : null}
        </div>

        {hasConfiguredOperatorLogin() ? (
          <form
            action={signInAction}
            className="grid gap-4 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface-alt)] p-6"
          >
            <input type="hidden" name="redirectTo" value={next} />
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[var(--app-ink)]">{t.operatorEmail}</span>
              <input
                name="email"
                type="email"
                required
                placeholder="owner@example.com"
                className="h-12 rounded-[calc(var(--app-radius)-4px)] border border-[color:var(--app-border)] bg-[var(--app-surface)] px-4 outline-none transition focus:border-[color:var(--app-accent)]"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[var(--app-ink)]">{t.accessCode}</span>
              <input
                name="loginCode"
                type="password"
                required
                placeholder="Configured via INFLOWEE_OPERATOR_LOGIN_CODE"
                className="h-12 rounded-[calc(var(--app-radius)-4px)] border border-[color:var(--app-border)] bg-[var(--app-surface)] px-4 outline-none transition focus:border-[color:var(--app-accent)]"
              />
            </label>
            <button className="inline-flex h-12 items-center justify-center rounded-[calc(var(--app-radius)-4px)] bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-ink)] transition opacity-95 hover:opacity-100">
              {t.signIn}
            </button>
          </form>
        ) : (
          <div className="rounded-[var(--app-radius)] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            {t.codeLoginMissing}
          </div>
        )}
      </section>
    </div>
  );
}
