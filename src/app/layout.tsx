import type { Metadata } from "next";

import { signOutAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { countUnreadBriefs, defaultStore } from "@/lib/store";

import "./globals.css";

export const metadata: Metadata = {
  title: "Inflowee",
  description: "AI-powered information hub MVP scaffold",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const actor = await getSessionUser().catch(() => null);
  const unreadCount = actor
    ? await countUnreadBriefs(defaultStore, { actorId: actor.id })
    : 0;

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-stone-100 text-stone-950" suppressHydrationWarning>
        <AppShell
          unreadCount={unreadCount}
          userEmail={actor?.email ?? null}
          signOutAction={actor ? signOutAction : undefined}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
