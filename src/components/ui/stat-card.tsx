import type { ElementType } from "react";

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  tone?: "positive" | "negative" | "neutral";
  icon?: ElementType;
  className?: string;
}

export function StatCard({ label, value, subtext, tone = "neutral", icon: Icon, className = "" }: StatCardProps) {
  const toneColor =
    tone === "positive"
      ? "text-bullish"
      : tone === "negative"
        ? "text-bearish"
        : "text-text-primary";

  const iconBg =
    tone === "positive"
      ? "bg-bullish/10 text-bullish"
      : tone === "negative"
        ? "bg-bearish/10 text-bearish"
        : "bg-accent/10 text-accent";

  return (
    <div className={`rounded-xl border border-border bg-bg-secondary p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">{label}</p>
          <p className={`mt-1.5 text-2xl font-semibold font-mono ${toneColor}`}>{value}</p>
          {subtext && (
            <p className={`mt-1 text-sm ${tone === "positive" ? "text-bullish" : tone === "negative" ? "text-bearish" : "text-text-secondary"}`}>
              {subtext}
            </p>
          )}
        </div>
        {Icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
