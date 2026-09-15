import type { ReactNode } from "react";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function AppAccordion({
  title,
  kicker,
  summary,
  open,
  onToggle,
  tone = "slate",
  headerRight,
  children,
}: {
  title: string;
  kicker?: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  tone?: "amber" | "teal" | "slate";
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const shell =
    tone === "amber"
      ? "border-amber-100 bg-amber-50/60"
      : tone === "teal"
        ? "border-teal-100 bg-teal-50/50"
        : "border-slate-200 bg-white";
  const kickerCls =
    tone === "amber" ? "text-amber-800" : tone === "teal" ? "text-teal-700" : "text-slate-500";
  const titleCls =
    tone === "amber" ? "text-amber-950" : tone === "teal" ? "text-teal-950" : "text-slate-900";

  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${shell}`}>
      <div className="flex items-start gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="-ml-1 min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left hover:bg-black/[0.03]"
          aria-expanded={open}
        >
          {kicker ? (
            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${kickerCls}`}>{kicker}</p>
          ) : null}
          <div className={`${kicker ? "mt-0.5" : ""} flex items-center gap-2`}>
            <h3 className={`text-sm font-semibold ${titleCls}`}>{title}</h3>
            <span className={kickerCls}>
              <Chevron open={open} />
            </span>
          </div>
          {!open && summary ? <p className="mt-0.5 text-xs text-slate-500">{summary}</p> : null}
        </button>
        {headerRight ? <div className="shrink-0 pt-0.5">{headerRight}</div> : null}
      </div>
      {open ? (
        <div className="h-[min(58vh,32rem)] overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
