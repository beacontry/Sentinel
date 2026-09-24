import { formatPnl, pnlDirection, type PnlFormat } from "@/lib/format-pnl";

/**
 * A gain or loss, printed so it reads without colour:
 *
 *   ▲ +$12.50      ▼ −$3.10      – $0.00
 *
 * - The glyph (▲ gain, ▼ loss, – flat) is aria-hidden; a visually hidden
 *   "gain" or "loss" after the figure is what a screen reader hears, so
 *   it does not read "black up-pointing triangle".
 * - The string comes from formatPnl, the one formatter (U+2212 minus,
 *   unsigned zero, dollars only without a basis).
 * - The colour follows the value as displayed after rounding, so a
 *   −$0.004 that prints "$0.00" is not painted as a loss.
 * - A null value is unknown, not zero: it prints "n/a" in the muted
 *   colour with no glyph.
 */

interface SignedValueProps {
  value: number | null | undefined;
  /** What a percent is taken of. Without it the value shows in dollars. */
  basis?: number;
  format?: PnlFormat;
  /** Drop the glyph where a column of them would be noise; the sign and the hidden word stay. */
  glyph?: boolean;
  className?: string;
}

const TONE = { gain: "text-bullish", loss: "text-bearish", flat: "text-text-secondary" } as const;
const GLYPH = { gain: "▲", loss: "▼", flat: "–" } as const;

export function SignedValue({ value, basis, format = "dollar", glyph = true, className = "" }: SignedValueProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={`font-mono tabular-nums text-text-muted ${className}`}>n/a</span>;
  }
  const direction = pnlDirection(value);
  return (
    <span className={`inline-flex items-baseline gap-1 font-mono tabular-nums ${TONE[direction]} ${className}`}>
      {glyph && (
        <span aria-hidden="true" className="leading-none">
          {GLYPH[direction]}
        </span>
      )}
      <span>{formatPnl(value, basis, format)}</span>
      {direction !== "flat" && <span className="sr-only">{direction}</span>}
    </span>
  );
}
