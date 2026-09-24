"use client";

import type { ReactNode } from "react";

/**
 * Two to five mutually exclusive choices that apply at once: Buy/Sell,
 * order type, engine mode, a chart range.
 *
 * A sunken track (bg-primary) holding transparent buttons; the chosen one
 * is raised onto the card fill with an edge and the card shadow, in full
 * text colour and semibold, so the choice reads by weight and edge as
 * well as fill. Styled from aria-pressed, never from a parallel class.
 * Radii are concentric: an 8px track with 4px padding gives 4px buttons.
 *
 * Buttons are 40px drawn with the hit area padded to 48px vertically.
 * A `tone` on an option colours it from the status triplet when chosen,
 * for Buy and Sell; give those options an `icon` (▲ ▼) as well, since the
 * word and the glyph are what carry the side, not the colour.
 */

type Tone = "bullish" | "bearish";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "Order side". */
  label: string;
  disabled?: boolean;
  /** Not ready yet (the current value is still loading): disabled and aria-busy. */
  busy?: boolean;
  /** Stretch the buttons to fill the track. */
  fullWidth?: boolean;
  className?: string;
}

const PRESSED_TONE: Record<Tone | "neutral", string> = {
  neutral: "aria-pressed:border-border aria-pressed:bg-bg-secondary aria-pressed:text-text-primary",
  bullish: "aria-pressed:border-bullish-line aria-pressed:bg-bullish-fill aria-pressed:text-bullish-fg",
  bearish: "aria-pressed:border-bearish-line aria-pressed:bg-bearish-fill aria-pressed:text-bearish-fg",
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  busy = false,
  fullWidth = false,
  className = "",
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      className={`${fullWidth ? "flex" : "inline-flex"} max-w-full gap-1 rounded-lg bg-bg-primary p-1 ${className}`}
    >
      {options.map((opt) => {
        const pressed = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled || busy || opt.disabled}
            onClick={() => {
              if (!pressed) onChange(opt.value);
            }}
            className={`relative inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded border border-transparent px-3 text-sm
              text-text-secondary whitespace-nowrap cursor-pointer transition-[background-color,border-color,color] duration-150
              before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']
              enabled:hover:text-text-primary
              aria-pressed:font-semibold aria-pressed:shadow-card
              disabled:cursor-not-allowed disabled:opacity-55
              ${PRESSED_TONE[opt.tone ?? "neutral"]} ${fullWidth ? "flex-1" : ""}`}
          >
            {opt.icon && (
              <span aria-hidden="true" className="inline-flex shrink-0">
                {opt.icon}
              </span>
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
