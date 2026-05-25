"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { localeLabels, type Dictionary, type Locale } from "@/lib/i18n";
import { UserProfileButton } from "@/components/user-profile-button";
import {
  APPEARANCES,
  THEME_IDS,
  getThemeCssVariables,
  getThemePreset,
  themePresets,
  type ThemePreference,
} from "@/lib/theme";

// ── Nav icons ─────────────────────────────────────────────────────────────────

type NavIconType = "home" | "discover" | "sources" | "inbox" | "settings";

function NavIcon({
  type,
  className = "h-[17px] w-[17px] shrink-0",
}: {
  type: NavIconType;
  className?: string;
}) {
  if (type === "home")
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 002 11h1v6a1 1 0 001 1h3a1 1 0 001-1v-3h4v3a1 1 0 001 1h3a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z" />
      </svg>
    );
  if (type === "discover")
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path
          fillRule="evenodd"
          d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
          clipRule="evenodd"
        />
      </svg>
    );
  if (type === "sources")
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path d="M5 3a1 1 0 000 2c5.523 0 10 4.477 10 10a1 1 0 102 0C17 8.373 11.627 3 5 3z" />
        <path d="M4 9a1 1 0 011-1 7 7 0 017 7 1 1 0 11-2 0 5 5 0 00-5-5 1 1 0 01-1-1z" />
        <path d="M3 15a2 2 0 114 0 2 2 0 01-4 0z" />
      </svg>
    );
  if (type === "inbox")
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
        <path
          fillRule="evenodd"
          d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z"
          clipRule="evenodd"
        />
      </svg>
    );
  // settings
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────

type NavItemConfig = {
  href: string;
  label: string;
  exact: boolean;
  iconType: NavIconType;
};

function getNavigationItems(labels: Dictionary["shell"]): NavItemConfig[] {
  return [
    { href: "/", label: labels.home, exact: true, iconType: "home" },
    { href: "/discover", label: labels.discover, exact: false, iconType: "discover" },
    { href: "/sources", label: labels.sources, exact: false, iconType: "sources" },
    { href: "/inbox", label: labels.inbox, exact: false, iconType: "inbox" },
    { href: "/settings", label: labels.settings, exact: false, iconType: "settings" },
  ];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AppShellProps = {
  children: React.ReactNode;
  unreadCount?: number;
  userEmail?: string | null;
  userNickname?: string | null;
  userAvatar?: string | null;
  locale: Locale;
  labels: Dictionary["shell"];
  themePreference: ThemePreference;
  signOutAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  saveUserProfileAction?: ((formData: FormData) => void | Promise<void>) | undefined;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRedirectPath(pathname: string) {
  return pathname || "/";
}

// ── Navigation ────────────────────────────────────────────────────────────────

function Navigation({
  labels,
  pathname,
  unreadCount,
  compact = false,
  tone = "surface",
}: NavigationProps) {
  const items = getNavigationItems(labels);
  const inactiveClass =
    tone === "panel"
      ? "text-[var(--app-panel-muted)] hover:bg-white/10 hover:text-[var(--app-panel-ink)]"
      : "text-[var(--app-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-ink)]";

  return (
    <nav
      aria-label={labels.navLabel}
      className={compact ? "flex items-center gap-0.5" : "grid gap-0.5"}
    >
      {items.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const hasUnread = item.href === "/inbox" && unreadCount > 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            title={compact ? item.label : undefined}
            className={`relative inline-flex items-center gap-2 rounded-[calc(var(--app-radius)-2px)] text-sm font-medium transition ${
              compact ? "h-7 justify-center px-1.5" : "min-h-10 justify-start px-3"
            } ${
              isActive
                ? "bg-[var(--app-accent)] text-[var(--app-accent-ink)]"
                : inactiveClass
            }`}
          >
            <NavIcon type={item.iconType} />
            {!compact && <span>{item.label}</span>}
            {hasUnread &&
              (compact ? (
                <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--app-accent)] ring-1 ring-[var(--app-panel)]" />
              ) : (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--app-panel)] px-1.5 text-xs font-semibold text-[var(--app-panel-ink)]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ))}
          </Link>
        );
      })}
    </nav>
  );
}

// ── PreferenceControls ────────────────────────────────────────────────────────

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
          <label
            className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}
          >
            {labels.language}
          </label>
          <select
            name="locale"
            defaultValue={locale}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className={selectClass}
          >
            {Object.entries(localeLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </form>
      ) : null}

      {setThemeAction ? (
        <form action={setThemeAction} className="grid gap-1.5">
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <input name="appearance" type="hidden" value={themePreference.appearance} />
          <label
            className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}
          >
            {labels.theme}
          </label>
          <select
            name="theme"
            defaultValue={themePreference.theme}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className={selectClass}
          >
            {THEME_IDS.map((t) => (
              <option key={t} value={t}>
                {themePresets[t].label[locale]}
              </option>
            ))}
          </select>
        </form>
      ) : null}

      {setThemeAction ? (
        <form action={setThemeAction} className="grid gap-1.5">
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <input name="theme" type="hidden" value={themePreference.theme} />
          <label
            className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}
          >
            {labels.appearance}
          </label>
          <select
            name="appearance"
            defaultValue={themePreference.appearance}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className={selectClass}
          >
            {APPEARANCES.map((a) => (
              <option key={a} value={a}>
                {a === "light" ? labels.light : labels.dark}
              </option>
            ))}
          </select>
        </form>
      ) : null}
    </div>
  );
}

// ── Inline controls (topbar) ──────────────────────────────────────────────────

function InlineControls({
  labels,
  locale,
  pathname,
  themePreference,
  setLocaleAction,
  setThemeAction,
}: {
  labels: Dictionary["shell"];
  locale: Locale;
  pathname: string;
  themePreference: ThemePreference;
  setLocaleAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  setThemeAction?: ((formData: FormData) => void | Promise<void>) | undefined;
}) {
  const redirectTo = getRedirectPath(pathname);
  const cls =
    "h-6 rounded-md border border-[color:var(--app-border)] bg-[var(--app-surface-alt)] px-1 text-[10px] text-[var(--app-ink)] outline-none transition";

  return (
    <div className="flex items-center gap-2">
      {setLocaleAction && (
        <form action={setLocaleAction}>
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <select
            name="locale"
            defaultValue={locale}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className={cls}
          >
            {Object.entries(localeLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </form>
      )}
      {setThemeAction && (
        <>
          <form action={setThemeAction}>
            <input name="redirectTo" type="hidden" value={redirectTo} />
            <input name="appearance" type="hidden" value={themePreference.appearance} />
            <select
              name="theme"
              defaultValue={themePreference.theme}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className={cls}
            >
              {THEME_IDS.map((t) => (
                <option key={t} value={t}>
                  {themePresets[t].label[locale]}
                </option>
              ))}
            </select>
          </form>
          <form action={setThemeAction}>
            <input name="redirectTo" type="hidden" value={redirectTo} />
            <input name="theme" type="hidden" value={themePreference.theme} />
            <select
              name="appearance"
              defaultValue={themePreference.appearance}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className={cls}
            >
              {APPEARANCES.map((a) => (
                <option key={a} value={a}>
                  {a === "light" ? labels.light : labels.dark}
                </option>
              ))}
            </select>
          </form>
        </>
      )}
    </div>
  );
}

// ── AccountPanel ──────────────────────────────────────────────────────────────

function AccountPanel({
  labels,
  isZh,
  userEmail,
  userNickname,
  userAvatar,
  signOutAction,
  saveUserProfileAction,
}: {
  labels: Dictionary["shell"];
  isZh: boolean;
  userEmail: string | null;
  userNickname: string | null;
  userAvatar: string | null;
  signOutAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  saveUserProfileAction?: ((formData: FormData) => void | Promise<void>) | undefined;
}) {
  if (!userEmail) {
    return (
      <div className="border-t border-[color:var(--app-border)] pt-4">
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-[calc(var(--app-radius)-4px)] bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-ink)] opacity-95 transition hover:opacity-100"
        >
          {labels.signIn}
        </Link>
      </div>
    );
  }

  return (
    <div className="border-t border-[color:var(--app-border)] pt-4">
      <UserProfileButton
        isZh={isZh}
        nickname={userNickname}
        avatar={userAvatar}
        userEmail={userEmail}
        signOutAction={signOutAction}
        saveUserProfileAction={saveUserProfileAction}
      />
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell({
  children,
  unreadCount = 0,
  userEmail = null,
  userNickname = null,
  userAvatar = null,
  locale,
  labels,
  themePreference,
  signOutAction,
  saveUserProfileAction,
  setLocaleAction,
  setThemeAction,
}: AppShellProps) {
  const pathname = usePathname();
  const isZh = locale === "zh";
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
  const accountProps = {
    labels,
    isZh,
    userEmail,
    userNickname,
    userAvatar,
    signOutAction,
    saveUserProfileAction,
  };

  // ── Topbar (Radar) — nav on the right ─────────────────────────────────────
  if (preset.layout === "topbar") {
    return (
      <div
        data-theme-root
        data-theme={themePreference.theme}
        data-appearance={themePreference.appearance}
        style={style}
        className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]"
      >
        <div className="mx-auto grid min-h-screen w-full max-w-[1540px] gap-3 px-3 py-2 lg:px-4">
          <header className="sticky top-2 z-20 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2">
              <Link href="/" className="shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--app-accent)]">
                  Inflowee
                </span>
                <span className="ml-1.5 text-[11px] text-[var(--app-muted)]">
                  {labels.productTagline}
                </span>
              </Link>
              <div className="ml-auto flex items-center gap-1.5">
                <InlineControls
                  labels={labels}
                  locale={locale}
                  pathname={pathname}
                  themePreference={themePreference}
                  setLocaleAction={setLocaleAction}
                  setThemeAction={setThemeAction}
                />
                <div className="h-4 w-px bg-[color:var(--app-border)]" />
                <Navigation
                  labels={labels}
                  pathname={pathname}
                  unreadCount={unreadCount}
                  compact
                />
              </div>
            </div>
          </header>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    );
  }

  // ── Split ─────────────────────────────────────────────────────────────────
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
          <aside className="grid content-start gap-4 overflow-hidden rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
            <div className="border-b border-[color:var(--app-border)] pb-3">
              <Link
                href="/"
                className="block rounded-[calc(var(--app-radius)-2px)] bg-[var(--app-panel)] p-3 text-[var(--app-panel-ink)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-accent)]">
                  Inflowee
                </p>
                <p className="mt-1.5 text-base font-semibold tracking-tight">
                  {labels.productTagline}
                </p>
              </Link>
            </div>
            <Navigation
              labels={labels}
              pathname={pathname}
              unreadCount={unreadCount}
            />
            <div className="mt-2">{controls}</div>
            <div className="mt-auto">
              <AccountPanel {...accountProps} />
            </div>
          </aside>
          <main className="min-w-0 pb-6">{children}</main>
        </div>
      </div>
    );
  }

  // ── Compact ───────────────────────────────────────────────────────────────
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
                  <span className="block text-xs opacity-70">{labels.productTagline}</span>
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <div className="rounded-[calc(var(--app-radius)-2px)] bg-[var(--app-surface)] px-2 py-1.5 text-[var(--app-ink)]">
                  <Navigation
                    labels={labels}
                    pathname={pathname}
                    unreadCount={unreadCount}
                    compact
                  />
                </div>
              </div>
            </div>
          </header>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <main className="min-w-0 pb-6">{children}</main>
            <aside className="grid content-start gap-4 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-32px)]">
              {controls}
              <AccountPanel {...accountProps} />
            </aside>
          </div>
        </div>
      </div>
    );
  }

  // ── Rail ──────────────────────────────────────────────────────────────────
  if (preset.layout === "rail") {
    const railItems = getNavigationItems(labels);
    return (
      <div
        data-theme-root
        data-theme={themePreference.theme}
        data-appearance={themePreference.appearance}
        style={style}
        className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]"
      >
        <div className="mx-auto grid min-h-screen w-full max-w-[1500px] gap-4 px-3 py-3 lg:grid-cols-[72px_1fr_300px] lg:px-5 lg:py-5">
          <aside className="flex flex-wrap items-center gap-2 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-panel)] p-3 text-[var(--app-panel-ink)] lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] lg:flex-col">
            <Link
              href="/"
              title={`Inflowee — ${labels.productTagline}`}
              aria-label="Inflowee"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[calc(var(--app-radius)-1px)] bg-[var(--app-accent)] text-sm font-bold text-[var(--app-accent-ink)]"
            >
              IF
            </Link>
            {railItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`relative inline-flex h-11 w-11 items-center justify-center rounded-[calc(var(--app-radius)-1px)] transition ${
                    isActive
                      ? "bg-[var(--app-surface)] text-[var(--app-ink)]"
                      : "opacity-70 text-[var(--app-panel-ink)] hover:bg-white/10 hover:opacity-100"
                  }`}
                >
                  <NavIcon type={item.iconType} className="h-5 w-5" />
                  {item.href === "/inbox" && unreadCount > 0 && (
                    <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[var(--app-accent)]" />
                  )}
                </Link>
              );
            })}
          </aside>
          <main className="min-w-0 pb-6">{children}</main>
          <aside className="grid content-start gap-4 rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-surface)] p-4 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)]">
            <Link href="/" className="block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-accent)]">
                Inflowee
              </p>
              <p className="mt-2 text-sm leading-5 opacity-80">{labels.productTagline}</p>
            </Link>
            {controls}
            <AccountPanel {...accountProps} />
          </aside>
        </div>
      </div>
    );
  }

  // ── Default sidebar (Focus) ───────────────────────────────────────────────
  return (
    <div
      data-theme-root
      data-theme={themePreference.theme}
      data-appearance={themePreference.appearance}
      style={style}
      className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]"
    >
      <div className="mx-auto grid min-h-screen w-full max-w-[1500px] gap-5 px-4 py-4 lg:grid-cols-[260px_1fr] lg:px-6 lg:py-6">
        <aside className="flex flex-col gap-4 overflow-hidden rounded-[var(--app-radius)] border border-[color:var(--app-border)] bg-[var(--app-panel)] p-4 text-[var(--app-panel-ink)] lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
          <div className="border-b border-white/10 pb-4">
            <Link href="/" className="block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--app-accent)]">
                Inflowee
              </p>
              <p className="mt-2 text-sm leading-5 opacity-80">{labels.productTagline}</p>
            </Link>
          </div>

          <Navigation
            labels={labels}
            pathname={pathname}
            unreadCount={unreadCount}
            tone="panel"
          />

          <div className="mt-auto flex flex-col gap-4">
            {panelControls}
            <AccountPanel {...accountProps} />
          </div>
        </aside>

        <main className="min-w-0 pb-6">{children}</main>
      </div>
    </div>
  );
}
