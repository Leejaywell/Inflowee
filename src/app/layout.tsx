import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";

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
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-stone-100 text-stone-950">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
