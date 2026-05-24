"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { localeLabels, type Dictionary, type Locale } from "@/lib/i18n";
import {
  APPEARANCES,
  THEME_IDS,
  getThemeCssVariables,
  getThemePreset,
  themePresets,
  type ThemePreference,
} from "@/lib/theme";

function getNavigationItems(labels: Dictionary["shell"]) {
  return [
    { href: "/", label: labels.home },
    { href: "/discover", label: labels.discover },
    { href: "/sources", label: labels.sources },
    { href: "/inbox", label: labels.inbox },
    { href: "/settings", label: labels.settings },
  ] as const;
}

type AppShellProps = {
  children: React.ReactNode;
  unreadCount?: number;
  userEmail?: string | null;
  locale: Locale;
  labels: Dictionary["shell"];
  themePreference: ThemePreference;
  signOutAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  setLocaleAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  setThemeAction?: ((formData: FormData) => void | Promise<void>) | undefined;
};

type NavigationProps = {
  labels: Dictionary["shell"];
  pathname: string;
  unreadCount: number;
  compact?: boolean;
  tone?: "surface" | "panel";
};

type PreferenceControlsProps = {
  labels: Dictionary["shell"];
  locale: Locale;
  pathname: string;
  themePreference: ThemePreference;
  setLocaleAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  setThemeAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  tone?: "surface" | "panel";
};

function getRedirectPath(pathname: string) {
  return pathname || "/";
}

function Navigation({
  labels,
  pathname,
  unreadCount,
  compact = false,
  tone = "surface",
}: NavigationProps) {
  const navigationItems = getNavigationItems(labels);
  const inactiveClass =
    tone === "panel"
      ? "text-[var(--app-panel-muted)] hover:bg-white/10 hover:text-[var(--app-panel-ink)]"
      : "text-[var(--app-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-ink)]";

  return (
    <nav
      aria-label={labels.navLabel}
      className={compact ? "flex flex-wrap items-center gap-2" : "grid gap-1"}
    >
      {navigationItems.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex min-h-10 items-center justify-between gap-2 rounded-[calc(var(--app-radius)-2px)] px-3 text-sm font-medium transition ${
              isActive
                ? "bg-[var(--app-accent)] text-[var(--app-accent-ink)]"
                : inactiveClass
            }`}
          >
            <span>{item.label}</span>
            {item.href === "/inbox" && unreadCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--app-panel)] px-1.5 text-xs font-semibold text-[var(--app-panel-ink)]">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function PreferenceControls({
  labels,
  locale,
  pathname,
  themePreference,
  setLocaleAction,
  setThemeAction,
  tone = "surface",
}: PreferenceControlsProps) {
  const redirectTo = getRedirectPath(pathname);
  const labelClass =
    tone === "panel" ? "text-[var(--app-panel-muted)]" : "text-[var(--app-muted)]";
  const selectClass =
    "h-10 rounded-[calc(var(--app-radius)-4px)] border border-[color:var(--app-border)] bg-[var(--app-surface-alt)] px-3 text-sm text-[var(--app-ink)] outline-none transition focus:border-[color:var(--app-accent)]";

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
      {setLocaleAction ? (
        <form action={setLocaleAction} className="grid gap-1.5">
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <label className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}>
            {labels.language}
          </label>
          <select
            name="locale"
            defaultValue={locale}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className={selectClass}
          >
            {Object.entries(localeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </form>
      ) : null}

      {setThemeAction ? (
        <form action={setThemeAction} className="grid gap-1.5">
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <input name="appearance" type="hidden" value={themePreference.appearance} />
          <label className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}>
            {labels.theme}
          </label>
          <select
            name="theme"
            defaultValue={themePreference.theme}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className={selectClass}
          >
            {THEME_IDS.map((theme) => (
              <option key={theme} value={theme}>
                {themePresets[theme].label[locale]}
              </option>
            ))}
          </select>
        </form>
      ) : null}

      {setThemeAction ? (
        <form action={setThemeAction} className="grid gap-1.5">
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <input name="theme" type="hidden" value={themePreference.theme} />
          <label className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}>
            {labels.appearance}
          </label>
          <select
            name="appearance"
            defaultValue={themePreference.appearance}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className={selectClass}
          >
            {APPEARANCES.map((appearance) => (
              <option key={appearance} value={appearance}>
                {appearance === "light" ? labels.light : labels.dark}
              </option>
            ))}
          </select>
        </form>
      ) : null}
    </div>
  );
}

function AccountPanel({
  labels,
  userEmail,
  signOutAction,
}: {
  labels: Dictionary["shell"];
  userEmail: string | null;
  signOutAction?: ((formData: FormData) => void | Promise<void>) | undefined;
}) {
  return (
    <div className="grid gap-3 border-t border-[color:var(--app-border)] pt-4">
      <div className="rounded-[calc(var(--app-radius)-2px)] bg-[var(--app-surface-alt)] px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-muted)]">
          {userEmail ? labels.signedInAs : labels.signIn}
        </p>
        <p className="mt-1 break-all text-xs leading-5 text-[var(--app-muted)]">
          {userEmail ?? labels.signedOut}
        </p>
      </div>

      {userEmail && signOutAction ? (
        <form action={signOutAction}>
          <button className="inline-flex h-10 w-full items-center justify-center rounded-[calc(var(--app-radius)-4px)] border border-[color:var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-medium text-[var(--app-ink)] transition hover:bg-[var(--app-surface-alt)]">
            {labels.signOut}
          </button>
        </form>
      ) : (
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-[calc(var(--app-radius)-4px)] bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-ink)] transition opacity-95 hover:opacity-100"
        >
          {labels.signIn}
        </Link>
      )}
    </div>
  );
}

export function AppShell({
  children,
  unreadCount = 0,
  userEmail = null,
  locale,
  labels,
  themePreference,
  signOutAction,
  setLocaleAction,
  setThemeAction,
}: AppShellProps) {
  const pathname = usePathname();
  const preset = getThemePreset(themePreference.theme);
  const style = getThemeCssVariables(themePreference) as CSSProperties;
  const controls = (
    <PreferenceControls
      labels={labels}
      locale={locale}
      pathname={pathname}
      themePreference={themePreference}
      setLocaleAction={setLocaleAction}
      setThemeAction={setThemeAction}
    />
  );
  const panelControls = (
    <PreferenceControls
      labels={labels}
      locale={locale}
      pathname={pathname}
      themePreference={themePreference}
      setLocaleAction={setLocaleAction}
      setThemeAction={setThemeAction}
      tone="panel"
    />
  );
  const account = (
    <AccountPanel
      labels={labels}
      userEmail={userEmail}
      signOutAction={signOutAction}
    />
  );
  const nav = (
    <Navigation labels={labels} pathname={pathname} unreadCount={unreadCount} />
  );
  const panelNav = (
    <Navigation
      labels={labels}
      pathname={pathname}
      unreadCount={unreadCount}
      tone="panel"
    />
  );
  const compactNav = (
    <Navigation
      labels={labels}
      pathname={pathname}
      unreadCount={unreadCount}
      compact
    />
  );

  if (preset.layout === "topbar") {
    return (
      <div
        data-theme-root
        data-theme={themePreference.theme}
        data-appearance={themePreference.appearance}
        style={style}
        className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]"
      >
        <div className="mx-auto grid min-h-screen w-full max-w-[1540px] gap-5 px-4 py-4 lg:px-6">
          <header className="sticky top-4 z-20 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] px-4 py-3 shadow-[0_16px_60px_rgba(0,0,0,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link href="/" className="min-w-[180px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-accent)]">
                  Inflowee
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight">
                  {labels.workspace}
                </p>
              </Link>
              {compactNav}
              <div className="w-full lg:w-[360px]">{controls}</div>
            </div>
          </header>
          <main className="min-w-0 pb-6">{children}</main>
        </div>
      </div>
    );
  }

  if (preset.layout === "split") {
    return (
      <div
        data-theme-root
        data-theme={themePreference.theme}
        data-appearance={themePreference.appearance}
        style={style}
        className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]"
      >
        <div className="mx-auto grid min-h-screen w-full max-w-[1540px] gap-5 px-4 py-4 lg:grid-cols-[340px_1fr] lg:px-6 lg:py-6">
          <aside className="grid content-start gap-5 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
            <Link href="/" className="rounded-[calc(var(--app-radius)-2px)] bg-[var(--app-panel)] p-4 text-[var(--app-panel-ink)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-70">
                Inflowee
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {labels.workspace}
              </p>
              <p className="mt-2 text-sm leading-6 opacity-75">
                {themePresets[preset.id].description[locale]}
              </p>
            </Link>
            {nav}
            <div className="mt-2">{controls}</div>
            <div className="mt-auto">{account}</div>
          </aside>
          <main className="min-w-0 pb-6">{children}</main>
        </div>
      </div>
    );
  }

  if (preset.layout === "compact") {
    return (
      <div
        data-theme-root
        data-theme={themePreference.theme}
        data-appearance={themePreference.appearance}
        style={style}
        className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]"
      >
        <div className="mx-auto grid min-h-screen w-full max-w-[1480px] gap-4 px-3 py-3 lg:px-5">
          <header className="rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-panel)] p-3 text-[var(--app-panel-ink)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[calc(var(--app-radius)-2px)] bg-[var(--app-accent)] text-sm font-bold text-[var(--app-accent-ink)]">
                  IF
                </span>
                <span>
                  <span className="block text-sm font-semibold">Inflowee</span>
                  <span className="block text-xs opacity-70">
                    {labels.productTagline}
                  </span>
                </span>
              </Link>
              <div className="rounded-[calc(var(--app-radius)-2px)] bg-[var(--app-surface)] px-2 py-2 text-[var(--app-ink)]">
                {compactNav}
              </div>
            </div>
          </header>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <main className="min-w-0 pb-6">{children}</main>
            <aside className="grid content-start gap-4 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-32px)]">
              {controls}
              {account}
            </aside>
          </div>
        </div>
      </div>
    );
  }

  if (preset.layout === "rail") {
    return (
      <div
        data-theme-root
        data-theme={themePreference.theme}
        data-appearance={themePreference.appearance}
        style={style}
        className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]"
      >
        <div className="mx-auto grid min-h-screen w-full max-w-[1500px] gap-4 px-3 py-3 lg:grid-cols-[86px_1fr_300px] lg:px-5 lg:py-5">
          <aside className="flex flex-wrap items-center gap-2 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-panel)] p-3 text-[var(--app-panel-ink)] lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] lg:flex-col">
            <Link
              href="/"
              className="inline-flex h-12 w-12 items-center justify-center rounded-[calc(var(--app-radius)-1px)] bg-[var(--app-accent)] text-sm font-bold text-[var(--app-accent-ink)]"
              aria-label="Inflowee"
            >
              IF
            </Link>
            {getNavigationItems(labels).map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`relative inline-flex h-12 w-12 items-center justify-center rounded-[calc(var(--app-radius)-1px)] text-sm font-semibold transition ${
                    isActive
                      ? "bg-[var(--app-surface)] text-[var(--app-ink)]"
                      : "text-[var(--app-panel-ink)] opacity-70 hover:bg-white/10 hover:opacity-100"
                  }`}
                >
                  {item.label.slice(0, 1)}
                  {item.href === "/inbox" && unreadCount > 0 && (
                    <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[var(--app-accent)]" />
                  )}
                </Link>
              );
            })}
          </aside>
          <main className="min-w-0 pb-6">{children}</main>
          <aside className="grid content-start gap-4 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-accent)]">
                Inflowee
              </p>
              <p className="mt-2 text-xl font-semibold tracking-tight">
                {labels.workspace}
              </p>
            </div>
            {controls}
            {account}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme-root
      data-theme={themePreference.theme}
      data-appearance={themePreference.appearance}
      style={style}
      className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]"
    >
      <div className="mx-auto grid min-h-screen w-full max-w-[1500px] gap-5 px-4 py-4 lg:grid-cols-[260px_1fr] lg:px-6 lg:py-6">
        <aside className="flex flex-col gap-5 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 text-[var(--app-panel-ink)] lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
          <div className="border-b border-white/10 pb-4">
            <Link href="/" className="block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-accent)]">
                Inflowee
              </p>
              <p className="mt-2 text-xl font-semibold tracking-tight">
                {labels.workspace}
              </p>
            </Link>
            <p className="mt-2 text-xs leading-5 opacity-70">
              {labels.productTagline}
            </p>
          </div>

          {panelNav}

          <div className="mt-auto grid gap-4">
            {panelControls}
            {account}
          </div>
        </aside>

        <main className="min-w-0 pb-6">{children}</main>
      </div>
    </div>
  );
}
