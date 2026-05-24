import Link from "next/link";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type SurfaceProps = {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  padded?: "sm" | "md" | "lg";
};

export function Surface({
  children,
  className,
  as: Component = "section",
  padded = "md",
}: SurfaceProps) {
  const padding = {
    sm: "p-4",
    md: "p-5 sm:p-6",
    lg: "p-6 sm:p-8",
  }[padded];

  return (
    <Component
      className={cx(
        "app-card rounded-[20px] border border-stone-900/10 bg-white shadow-none",
        padding,
        className,
      )}
    >
      {children}
    </Component>
  );
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  metrics?: React.ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  metrics,
}: PageHeaderProps) {
  return (
    <Surface className="shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <span className="app-badge px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
              {eyebrow}
            </span>
          ) : null}
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {metrics ? <div className="mt-4">{metrics}</div> : null}
    </Surface>
  );
}

type MetricPillProps = {
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
};

export function MetricPill({ value, label, tone = "default" }: MetricPillProps) {
  const toneClass = {
    default: "bg-stone-100 text-stone-700",
    accent: "bg-[#0057ff]/10 text-[#0057ff]",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
  }[tone];

  return (
    <div className={cx("rounded-2xl px-4 py-3 text-center", toneClass)}>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-75">
        {label}
      </div>
    </div>
  );
}

type NoticeProps = {
  children: React.ReactNode;
  tone?: "success" | "danger" | "warning";
};

export function Notice({ children, tone = "success" }: NoticeProps) {
  const toneClass = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];

  return (
    <section className={cx("rounded-[16px] border px-5 py-4 text-sm", toneClass)}>
      {children}
    </section>
  );
}

type SectionNavProps<T extends string> = {
  items: readonly T[];
  active: T;
  getHref: (item: T) => string;
  getLabel: (item: T) => string;
};

export function SectionNav<T extends string>({
  items,
  active,
  getHref,
  getLabel,
}: SectionNavProps<T>) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Section navigation">
      {items.map((item) => (
        <Link
          key={item}
          href={getHref(item)}
          className={cx(
            "inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition",
            active === item
              ? "bg-stone-950 text-white"
              : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
          )}
        >
          {getLabel(item)}
        </Link>
      ))}
    </nav>
  );
}

export function SecondaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center rounded-xl border border-stone-200 px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
    >
      {children}
    </Link>
  );
}

export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
    >
      {children}
    </Link>
  );
}
