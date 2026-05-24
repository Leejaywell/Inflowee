import type { Metadata } from "next";

import { setLocaleAction, setThemeAction, signOutAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { getRequestLocale } from "@/lib/i18n-server";
import { getDictionary } from "@/lib/i18n";
import { countUnreadBriefs, defaultStore } from "@/lib/store";
import { getRequestThemePreference } from "@/lib/theme-server";

import "./globals.css";

export const metadata: Metadata = {
  title: "Inflowee",
  description: "AI-powered personal monitoring workspace",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [actor, locale, themePreference] = await Promise.all([
    getSessionUser().catch(() => null),
    getRequestLocale(),
    getRequestThemePreference(),
  ]);
  const dict = getDictionary(locale);
  const unreadCount = actor
    ? await countUnreadBriefs(defaultStore, { actorId: actor.id })
    : 0;

  return (
    <html
      lang={locale}
      data-theme={themePreference.theme}
      data-appearance={themePreference.appearance}
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        <AppShell
          unreadCount={unreadCount}
          userEmail={actor?.email ?? null}
          locale={locale}
          labels={dict.shell}
          themePreference={themePreference}
          signOutAction={actor ? signOutAction : undefined}
          setLocaleAction={setLocaleAction}
          setThemeAction={setThemeAction}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
