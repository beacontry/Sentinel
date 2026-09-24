import type { ElementType } from "react";
import {
  STATUS_TONE_FILL_CLASSES,
  STATUS_TONE_TEXT_CLASSES,
  type StatusTone,
} from "@/lib/status-tone";
import { DirectionGlyph, DirectionWord } from "./signed-value";

const TONE: Record<"positive" | "negative" | "neutral", StatusTone> = {
  positive: "bullish",
  negative: "bearish",
  neutral: "neutral",
};

const DIRECTION = { positive: "gain", negative: "loss" } as const;

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  /**
   * positive and negative colour the value and also print ▲ or ▼ with a
   * hidden "gain" or "loss", so the tone never rests on colour alone.
   */
  tone?: "positive" | "negative" | "neutral";
  icon?: ElementType;
  className?: string;
}

export function StatCard({ label, value, subtext, tone = "neutral", icon: Icon, className = "" }: StatCardProps) {
  const toneColor = STATUS_TONE_TEXT_CLASSES[TONE[tone]];
  const iconBg = STATUS_TONE_FILL_CLASSES[tone === "neutral" ? "accent" : TONE[tone]];
  const direction = tone === "neutral" ? null : DIRECTION[tone];

  return (
    <div className={`rounded-xl border border-border bg-bg-secondary p-4 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-text-muted">{label}</p>
          <p className={`mt-1.5 text-xl font-semibold font-mono tabular-nums ${toneColor}`}>
            {direction && <DirectionGlyph direction={direction} />}
            {value}
            {direction && <DirectionWord direction={direction} />}
          </p>
          {subtext && (
            <p className={`mt-1 text-sm ${tone === "neutral" ? "text-text-secondary" : toneColor}`}>
              {subtext}
            </p>
          )}
        </div>
        {Icon && (
          <div aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
