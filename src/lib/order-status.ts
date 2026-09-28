import { tradeStatusTone, type StatusTone } from "./status-tone";

/**
 * How an order or trade status is shown: a word, a tone and an icon.
 *
 * The tone comes from tradeStatusTone() in status-tone.ts, the one map
 * from a status to a colour, so this adds the words and icons without
 * a second opinion on which statuses are good or bad. The icon is what
 * keeps a status readable without colour: a filled order carries a
 * check, a rejected one a cross.
 *
 * Covers the broker's order statuses (new, accepted, pending_new,
 * partially_filled, filled, canceled, expired, rejected, replaced) and
 * the engine's trade rows (FILLED, PENDING, FAILED, PARTIAL_FILLED …),
 * in any case. Anything else keeps its raw text and a neutral tone.
 */

export type OrderStatusIcon = "check" | "cross" | "clock" | "half" | "ban" | "replace" | "dot";

export interface OrderStatusMeta {
  label: string;
  tone: StatusTone;
  icon: OrderStatusIcon;
}

const KNOWN: Record<string, { label: string; icon: OrderStatusIcon }> = {
  new: { label: "New", icon: "clock" },
  accepted: { label: "Accepted", icon: "clock" },
  pending_new: { label: "Pending", icon: "clock" },
  pending: { label: "Pending", icon: "clock" },
  partially_filled: { label: "Partially filled", icon: "half" },
  partial_filled: { label: "Partially filled", icon: "half" },
  filled: { label: "Filled", icon: "check" },
  canceled: { label: "Canceled", icon: "ban" },
  cancelled: { label: "Canceled", icon: "ban" },
  expired: { label: "Expired", icon: "clock" },
  rejected: { label: "Rejected", icon: "cross" },
  failed: { label: "Failed", icon: "cross" },
  replaced: { label: "Replaced", icon: "replace" },
};

export function orderStatusMeta(status: string | null | undefined): OrderStatusMeta {
  const raw = (status ?? "").trim();
  const known = KNOWN[raw.toLowerCase()];
  const tone = tradeStatusTone(raw);
  if (!known) return { label: raw || "Unknown", tone, icon: "dot" };
  return { label: known.label, tone, icon: known.icon };
}
