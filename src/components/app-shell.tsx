import Link from "next/link";

const navigationItems = [
  { href: "/", label: "Home" },
  { href: "/sources", label: "Sources" },
] as const;

type AppShellProps = {
  currentPath: string;
  children: React.ReactNode;
};

export function AppShell({ currentPath, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f1e9_0%,#f3f4ef_40%,#eceee9_100%)] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-stone-900/10 bg-white/85 px-5 py-4 shadow-[0_16px_50px_rgba(33,24,9,0.06)] backdrop-blur">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-stone-950 uppercase">
              Inflowee
            </p>
            <p className="text-sm text-stone-500">
              Planning surface for tasks and sources.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            {navigationItems.map((item) => {
              const isActive = item.href === currentPath;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition ${
                    isActive
                      ? "bg-stone-950 text-stone-50"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
