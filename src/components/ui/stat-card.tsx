import type { ElementType, ReactNode } from "react";
import {
  STATUS_TONE_FILL_CLASSES,
  STATUS_TONE_TEXT_CLASSES,
  type StatusTone,
} from "@/lib/status-tone";
import type { PnlDirection } from "@/lib/format-pnl";
import { DirectionGlyph, DirectionWord } from "./signed-value";

const TONE: Record<"positive" | "negative" | "neutral", StatusTone> = {
  positive: "bullish",
  negative: "bearish",
  neutral: "neutral",
};

/**
 * card: a standalone tile on the page, bordered on bg-secondary.
 * inset: a tile inside a panel or card. It renders as an Inset (bg-surface,
 * no border, no shadow), so a panel of tiles is not cards nested in a card.
 */
export type StatCardSurface = "card" | "inset";

const SURFACE: Record<StatCardSurface, string> = {
  card: "rounded-xl border border-border bg-bg-secondary p-4 shadow-card",
  inset: "rounded-lg bg-bg-surface p-3",
};

interface StatCardProps {
  label: string;
  /** A preformatted string, or a SignedValue for a gain or loss. */
  value: ReactNode;
  subtext?: string;
  /** Colour only. The label and the printed value carry the meaning. */
  tone?: "positive" | "negative" | "neutral";
  /**
   * Set only when the value really is a gain or a loss. It prints ▲, ▼
   * or – and a hidden "gain" or "loss". Never inferred from tone: a
   * drawdown or a placeholder is coloured without being a loss.
   */
  direction?: PnlDirection;
  surface?: StatCardSurface;
  icon?: ElementType;
  className?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  tone = "neutral",
  direction,
  surface = "card",
  icon: Icon,
  className = "",
}: StatCardProps) {
  const toneColor = STATUS_TONE_TEXT_CLASSES[TONE[tone]];
  const iconBg = STATUS_TONE_FILL_CLASSES[tone === "neutral" ? "accent" : TONE[tone]];

  return (
    <div className={`${SURFACE[surface]} ${className}`}>
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
