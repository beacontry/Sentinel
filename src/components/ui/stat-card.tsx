import type { ElementType } from "react";
import {
  STATUS_TONE_FILL_CLASSES,
  STATUS_TONE_TEXT_CLASSES,
  type StatusTone,
} from "@/lib/status-tone";

const TONE: Record<"positive" | "negative" | "neutral", StatusTone> = {
  positive: "bullish",
  negative: "bearish",
  neutral: "neutral",
};

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  tone?: "positive" | "negative" | "neutral";
  icon?: ElementType;
  className?: string;
}

export function StatCard({ label, value, subtext, tone = "neutral", icon: Icon, className = "" }: StatCardProps) {
  const toneColor = STATUS_TONE_TEXT_CLASSES[TONE[tone]];
  const iconBg = STATUS_TONE_FILL_CLASSES[tone === "neutral" ? "accent" : TONE[tone]];

  return (
    <div className={`rounded-xl border border-border bg-bg-secondary p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-muted">{label}</p>
          <p className={`mt-1.5 text-2xl font-semibold font-mono ${toneColor}`}>{value}</p>
          {subtext && (
            <p className={`mt-1 text-sm ${tone === "neutral" ? "text-text-secondary" : toneColor}`}>
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
