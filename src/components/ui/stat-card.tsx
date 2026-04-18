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
      ? "bg-bullish/15 text-bullish"
      : tone === "negative"
        ? "bg-bearish/15 text-bearish"
        : "bg-bg-surface text-text-muted";

  return (
    <div className={`rounded-xl border border-border bg-bg-secondary p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
          <p className={`mt-1 text-2xl font-bold font-mono ${toneColor}`}>{value}</p>
          {subtext && (
            <p className={`mt-1 text-xs ${tone === "positive" ? "text-bullish" : tone === "negative" ? "text-bearish" : "text-text-secondary"}`}>
              {subtext}
            </p>
          )}
        </div>
        {Icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
