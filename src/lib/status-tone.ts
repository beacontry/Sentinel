/**
 * The one mapping from a state to its colour classes.
 *
 * Before this, every badge, stat tile and status pill built its own
 * `bg-bullish/10 text-bullish` string, with /5, /10, /15 and /20 alphas
 * and borders at /20, /25 and /30, so the same state looked different on
 * every page and none of it was measured. These classes use the state
 * triplets from globals.css (-fg text on its own -fill, with a -line edge),
 * which theme-contrast.test.ts checks at 4.5:1 in every theme and in
 * colour-blind mode.
 *
 * Colour is never the only carrier: whatever renders a tone also prints
 * the state in words (the badge text, the status label, a signed value).
 */

export type StatusTone = "bullish" | "bearish" | "warning" | "neutral" | "accent";

/** Chip or banner: edge, fill and text. */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  bullish: "border-bullish-line bg-bullish-fill text-bullish-fg",
  bearish: "border-bearish-line bg-bearish-fill text-bearish-fg",
  warning: "border-warning-line bg-warning-fill text-warning-fg",
  neutral: "border-border bg-bg-elevated text-text-secondary",
  accent: "border-accent/40 bg-accent-muted text-accent",
};

/** Fill and text without an edge, for an icon tile. */
export const STATUS_TONE_FILL_CLASSES: Record<StatusTone, string> = {
  bullish: "bg-bullish-fill text-bullish-fg",
  bearish: "bg-bearish-fill text-bearish-fg",
  warning: "bg-warning-fill text-warning-fg",
  neutral: "bg-bg-elevated text-text-secondary",
  accent: "bg-accent-muted text-accent",
};

/** Text only, on a card or the page: a figure, a P&L value. */
export const STATUS_TONE_TEXT_CLASSES: Record<StatusTone, string> = {
  bullish: "text-bullish",
  bearish: "text-bearish",
  warning: "text-warning",
  neutral: "text-text-primary",
  accent: "text-accent",
};

/**
 * Tone for a trade or order status, from the engine's trade rows
 * (FILLED, PENDING, FAILED, REJECTED, CANCELED, EXPIRED, PARTIAL_FILLED)
 * or the broker's order statuses (filled, partially_filled, rejected,
 * new, accepted …). Case-insensitive. Anything unrecognised is neutral,
 * never a guess at success or failure.
 */
export function tradeStatusTone(status: string | null | undefined): StatusTone {
  switch ((status ?? "").toLowerCase()) {
    case "filled":
      return "bullish";
    case "partial_filled":
    case "partially_filled":
      return "warning";
    case "rejected":
    case "failed":
      return "bearish";
    default:
      return "neutral";
  }
}
