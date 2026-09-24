import {
  formatPnlParts,
  formatSignedPercent,
  percentDirection,
  pnlDirection,
  type PnlDirection,
  type PnlFormat,
} from "@/lib/format-pnl";

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

/**
 * The glyph and hidden word for a value whose direction is known but which
 * arrives as a preformatted string (a stat tile, an intro readout). Put
 * the value between them: glyph, value, word.
 *
 * The direction is always passed by the caller, never read off a colour
 * tone: a risk figure, a count or a placeholder can be painted red or
 * green without being a loss or a gain. Flat draws "–" and says nothing.
 */
export function DirectionGlyph({ direction }: { direction: PnlDirection }) {
  return (
    <span aria-hidden="true" className="mr-1 leading-none">
      {GLYPH[direction]}
    </span>
  );
}

export function DirectionWord({ direction }: { direction: PnlDirection }) {
  if (direction === "flat") return null;
  return <span className="sr-only"> {direction}</span>;
}

/**
 * Wrapping keeps each token whole. The glyph and the signed figure are one
 * unbreakable group, and the "both" format's percent is a second one, so
 * the only place a narrow container can break is the gap between them:
 * never mid-number, and never between a sign and its digits. The percent
 * carries a real leading space (collapsed at the start of its box) so the
 * text copies and reads as "+$12.50 (+1.25%)".
 */
export function SignedValue({ value, basis, format = "dollar", glyph = true, className = "" }: SignedValueProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={`font-mono tabular-nums text-text-muted ${className}`}>n/a</span>;
  }
  const direction = pnlDirection(value);
  const { amount, percent } = formatPnlParts(value, basis, format);
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-[1ch] font-mono tabular-nums ${TONE[direction]} ${className}`}>
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
        {glyph && (
          <span aria-hidden="true" className="leading-none">
            {GLYPH[direction]}
          </span>
        )}
        <span>{amount}</span>
      </span>
      {percent && <span className="whitespace-nowrap">{` ${percent}`}</span>}
      {direction !== "flat" && <span className="sr-only">{direction}</span>}
    </span>
  );
}

/** What the glyph and its gap take, in ch, beside the figure. */
const GLYPH_CH = 1.75;

/**
 * The width in ch of the widest unbreakable line a SignedValue prints:
 * the glyph and signed figure together, or the percent alone. A container
 * that has to hold the figure whole sizes itself from this.
 */
export function signedValueCh(value: number | null | undefined, basis?: number, format: PnlFormat = "dollar", glyph = true): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 3;
  const { amount, percent } = formatPnlParts(value, basis, format);
  return Math.max(amount.length + (glyph ? GLYPH_CH : 0), percent ? percent.length : 0);
}

/**
 * A percent that is itself the change (a quote's day change), with no
 * dollar figure to take it of. Same reading as SignedValue: the glyph and
 * colour follow the percent as printed at two decimals, so an unchanged
 * quote is "– 0.00%" in secondary text rather than a green "▲ 0.00%", and
 * an unknown is "n/a" with no glyph.
 */
export function SignedPercent({ value, glyph = true, className = "" }: { value: number | null | undefined; glyph?: boolean; className?: string }) {
  const direction = percentDirection(value);
  if (direction === undefined) {
    return <span className={`font-mono tabular-nums text-text-muted ${className}`}>n/a</span>;
  }
  return (
    <span className={`inline-flex items-baseline gap-1 font-mono tabular-nums ${TONE[direction]} ${className}`}>
      {glyph && (
        <span aria-hidden="true" className="leading-none">
          {GLYPH[direction]}
        </span>
      )}
      <span>{formatSignedPercent(value as number)}</span>
      {direction !== "flat" && <span className="sr-only">{direction}</span>}
    </span>
  );
}
