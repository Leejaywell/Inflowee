import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { countUnreadBriefs, defaultStore } from "@/lib/store";

import "./globals.css";

export const metadata: Metadata = {
  title: "Inflowee",
  description: "AI-powered information hub MVP scaffold",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [unreadCount, sessionUser] = await Promise.all([
    countUnreadBriefs(defaultStore),
    getSessionUser(),
  ]);

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-stone-100 text-stone-950" suppressHydrationWarning>
        <AppShell unreadCount={unreadCount} userEmail={sessionUser?.email}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
