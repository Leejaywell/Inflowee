import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { countUnreadBriefs, defaultStore } from "@/lib/store";

import "./globals.css";

export const metadata: Metadata = {
  title: "Inflowee",
  description: "AI-powered information hub MVP scaffold",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const unreadCount = countUnreadBriefs(defaultStore);

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-stone-100 text-stone-950" suppressHydrationWarning>
        <AppShell unreadCount={unreadCount}>{children}</AppShell>
      </body>
    </html>
  );
}
