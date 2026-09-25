/**
 * The one P&L formatter.
 *
 * Before this there were two: formatPnl wrote a hyphen for a loss, and
 * the trader page built its own strings with a U+2212 minus, so one page
 * showed both. The "both" format also printed a loss's dollar part with
 * no sign at all ("$12.50 (-1.20%)").
 *
 * - Dollars are grouped in thousands ("+$1,284.50").
 * - A gain gets "+", a loss the typographic minus U+2212 (the width of
 *   "+", so columns of figures line up), in the dollar and percent parts.
 * - Zero, and anything that rounds to zero at two decimals, is "$0.00"
 *   with no sign: a "+$0.00" or "−$0.00" claims a direction that is not
 *   there.
 * - Without a basis (undefined, zero or not finite) the percent is
 *   undefined, so the dollar figure is shown whatever the format asks
 *   for. Never a percent against an invented basis.
 * - NaN or Infinity prints "n/a": an unknown is not a zero.
 */

export type PnlFormat = "dollar" | "percent" | "both";

export const MINUS = "−";

/** What a value that is not a number prints as: unknown, never zero. */
export const UNAVAILABLE = "n/a";

export type PnlDirection = "gain" | "loss" | "flat";

/** The direction a value displays as, after rounding to cents. */
export function pnlDirection(amountUsd: number): PnlDirection {
  const cents = Math.round(amountUsd * 100);
  if (!Number.isFinite(cents) || cents === 0) return "flat";
  return cents > 0 ? "gain" : "loss";
}

function signOf(direction: PnlDirection): string {
  return direction === "gain" ? "+" : direction === "loss" ? MINUS : "";
}

// Grouped like every other money figure in the app ("$12,345.00"), so
// one page does not mix "+$1284.50" with "$12,345".
const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dollars to the cent, grouped, no sign. */
function dollars(abs: number): string {
  return `$${CENTS.format(abs)}`;
}

/**
 * A balance or a price, not a change: grouped, to the cent, no "+". A
 * negative balance still takes the U+2212 minus. NaN or Infinity is n/a.
 */
export function formatUsd(amountUsd: number): string {
  if (!Number.isFinite(amountUsd)) return UNAVAILABLE;
  const cents = Math.round(amountUsd * 100);
  return `${cents < 0 ? MINUS : ""}${dollars(Math.abs(cents) / 100)}`;
}

export function formatSignedUsd(amountUsd: number): string {
  if (!Number.isFinite(amountUsd)) return UNAVAILABLE;
  const direction = pnlDirection(amountUsd);
  return `${signOf(direction)}${dollars(direction === "flat" ? 0 : Math.abs(amountUsd))}`;
}

/**
 * The direction a percent displays as at `digits` decimals. A null or
 * non-finite percent has none: it prints as unknown, not as flat.
 */
export function percentDirection(pct: number | null | undefined, digits = 2): PnlDirection | undefined {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return undefined;
  const rounded = Math.round(pct * 10 ** digits);
  if (rounded === 0) return "flat";
  return rounded > 0 ? "gain" : "loss";
}

export function formatSignedPercent(pct: number): string {
  if (!Number.isFinite(pct)) return UNAVAILABLE;
  const direction = percentDirection(pct) ?? "flat";
  return `${signOf(direction)}${direction === "flat" ? "0.00" : Math.abs(pct).toFixed(2)}%`;
}

/**
 * The tokens of a formatted P&L: the signed figure, and for the "both"
 * format the parenthesised percent after it. A renderer that wraps keeps
 * each token whole and breaks only between them, so a sign never lands on
 * a different line from its digits.
 */
export interface PnlParts {
  amount: string;
  percent?: string;
}

export function formatPnlParts(amountUsd: number, basis: number | undefined, format: PnlFormat): PnlParts {
  const dollar = formatSignedUsd(amountUsd);
  if (basis === undefined || basis === 0 || !Number.isFinite(basis) || format === "dollar") return { amount: dollar };
  const pct = formatSignedPercent((amountUsd / basis) * 100);
  if (format === "percent") return { amount: pct };
  return { amount: dollar, percent: `(${pct})` };
}

export function formatPnl(amountUsd: number, basis: number | undefined, format: PnlFormat): string {
  const { amount, percent } = formatPnlParts(amountUsd, basis, format);
  return percent ? `${amount} ${percent}` : amount;
}
