/**
 * The one P&L formatter.
 *
 * Before this there were two: formatPnl wrote a hyphen for a loss, and
 * the trader page built its own strings with a U+2212 minus, so one page
 * showed both. The "both" format also printed a loss's dollar part with
 * no sign at all ("$12.50 (-1.20%)").
 *
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

/** Dollars to the cent, no sign. */
function dollars(abs: number): string {
  return `$${abs.toFixed(2)}`;
}

export function formatSignedUsd(amountUsd: number): string {
  if (!Number.isFinite(amountUsd)) return UNAVAILABLE;
  const direction = pnlDirection(amountUsd);
  return `${signOf(direction)}${dollars(direction === "flat" ? 0 : Math.abs(amountUsd))}`;
}

export function formatSignedPercent(pct: number): string {
  if (!Number.isFinite(pct)) return UNAVAILABLE;
  const rounded = Math.round(pct * 100);
  const direction: PnlDirection = !Number.isFinite(rounded) || rounded === 0 ? "flat" : rounded > 0 ? "gain" : "loss";
  return `${signOf(direction)}${direction === "flat" ? "0.00" : Math.abs(pct).toFixed(2)}%`;
}

export function formatPnl(amountUsd: number, basis: number | undefined, format: PnlFormat): string {
  const dollar = formatSignedUsd(amountUsd);
  if (basis === undefined || basis === 0 || !Number.isFinite(basis) || format === "dollar") return dollar;
  const pct = formatSignedPercent((amountUsd / basis) * 100);
  if (format === "percent") return pct;
  return `${dollar} (${pct})`;
}
