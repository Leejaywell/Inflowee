import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { requireSessionActor } from "@/lib/auth";
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
  const actor = await requireSessionActor();
  const unreadCount = await countUnreadBriefs(defaultStore, { actorId: actor.id });

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-stone-100 text-stone-950" suppressHydrationWarning>
        <AppShell unreadCount={unreadCount} userEmail={actor.email}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
