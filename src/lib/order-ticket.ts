/**
 * The manual order ticket's rules, as pure functions: what the form holds,
 * what it would cost, whether it may be sent, the body it sends, and the
 * position it would leave. The page owns loading and submitting; this owns
 * every decision that can be tested without a browser.
 *
 * Notional (dollar) orders are constrained by Alpaca to market type with
 * day or ioc time-in-force, and bracket orders to share counts on the buy
 * side. The route's validator enforces both; the ticket says so first.
 */

export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type TimeInForce = "day" | "gtc" | "ioc" | "fok";
export type SizingMode = "shares" | "dollars";
export type OrderSide = "buy" | "sell";

export interface TicketFields {
  side: OrderSide;
  sizingMode: SizingMode;
  qty: string;
  notional: string;
  orderType: OrderType;
  tif: TimeInForce;
  limitPrice: string;
  stopPrice: string;
  useBracket: boolean;
  takeProfitPrice: string;
  stopLossPrice: string;
}

export const INITIAL_TICKET: TicketFields = {
  side: "buy",
  sizingMode: "shares",
  qty: "",
  notional: "",
  orderType: "market",
  tif: "day",
  limitPrice: "",
  stopPrice: "",
  useBracket: false,
  takeProfitPrice: "",
  stopLossPrice: "",
};

/**
 * The ticket after the active account changed: everything sized for the
 * previous account is cleared. Side, order type and TIF are kept.
 */
export function resetSizing(f: TicketFields): TicketFields {
  return {
    ...f,
    qty: "",
    notional: "",
    limitPrice: "",
    stopPrice: "",
    useBracket: false,
    takeProfitPrice: "",
    stopLossPrice: "",
  };
}

export function usesLimitPrice(t: OrderType): boolean {
  return t === "limit" || t === "stop_limit";
}

export function usesStopPrice(t: OrderType): boolean {
  return t === "stop" || t === "stop_limit";
}

/** A dollar order with a type or TIF the broker refuses for notional. */
export function notionalConflict(f: TicketFields): boolean {
  return f.sizingMode === "dollars" && (f.orderType !== "market" || (f.tif !== "day" && f.tif !== "ioc"));
}

/** A bracket is offered only on a share-count buy. */
export function bracketOffered(f: TicketFields): boolean {
  return f.side === "buy" && f.sizingMode === "shares";
}

/**
 * The price an estimate is taken at: the limit for limit and stop-limit
 * orders, otherwise the quote. Null when that price is not known.
 */
export function estimatePrice(f: TicketFields, quotePrice: number | null): number | null {
  const price = usesLimitPrice(f.orderType) ? parseFloat(f.limitPrice) : quotePrice;
  if (price === null || !(price > 0)) return null;
  return price;
}

/** Estimated cost (buy) or proceeds (sell). Informational only. */
export function estimateOrderValue(f: TicketFields, quotePrice: number | null): number | null {
  const price = estimatePrice(f, quotePrice);
  if (price === null) return null;
  if (f.sizingMode === "dollars") {
    const n = parseFloat(f.notional);
    return isNaN(n) ? null : n;
  }
  const q = parseFloat(f.qty);
  if (isNaN(q)) return null;
  return q * price;
}

/** Why the order cannot be sent, or null. First failure wins. */
export function validateTicket(
  f: TicketFields,
  engine: { blocked: boolean; unknown: boolean },
): string | null {
  if (engine.blocked) return "Stop the engine before placing manual orders.";
  if (engine.unknown) return "Engine status unknown. Retry before placing an order.";
  if (f.sizingMode === "shares") {
    const q = parseFloat(f.qty);
    if (!q || q <= 0) return "Enter a share quantity greater than 0.";
  } else {
    const n = parseFloat(f.notional);
    if (!n || n <= 0) return "Enter a dollar amount greater than 0.";
    if (notionalConflict(f)) return "Dollar-based orders must be market type with day or ioc TIF.";
  }
  if (usesLimitPrice(f.orderType)) {
    const p = parseFloat(f.limitPrice);
    if (!p || p <= 0) return "Limit price required.";
  }
  if (usesStopPrice(f.orderType)) {
    const s = parseFloat(f.stopPrice);
    if (!s || s <= 0) return "Stop price required.";
  }
  if (f.useBracket && f.side !== "buy") return "Bracket orders are for entries (buy side) only.";
  if (f.useBracket) {
    const hasTP = f.takeProfitPrice && parseFloat(f.takeProfitPrice) > 0;
    const hasSL = f.stopLossPrice && parseFloat(f.stopLossPrice) > 0;
    if (!hasTP && !hasSL) return "Bracket needs at least a take-profit or stop-loss.";
  }
  return null;
}

/**
 * The POST /api/broker/orders body for this ticket, before the account
 * fence and the client order id are added.
 */
export function orderRequestBody(symbol: string, f: TicketFields): Record<string, string | undefined> {
  const body: Record<string, string | undefined> = {
    symbol,
    side: f.side,
    type: f.orderType,
    timeInForce: f.tif,
  };
  if (f.sizingMode === "shares") body.qty = f.qty;
  else body.notional = f.notional;
  if (usesLimitPrice(f.orderType)) body.limitPrice = f.limitPrice;
  if (usesStopPrice(f.orderType)) body.stopPrice = f.stopPrice;
  if (f.useBracket) {
    body.orderClass = "bracket";
    if (f.takeProfitPrice) body.takeProfitPrice = f.takeProfitPrice;
    if (f.stopLossPrice) body.stopLossPrice = f.stopLossPrice;
  }
  return body;
}

// ─── Position ──────────────────────────────────────────────────────

/**
 * The signed quantity held in `symbol` (negative for a short) from a
 * /api/broker/account body. Zero when the positions were read and none is
 * held; null when they were not read, which is not the same as none.
 */
export function heldQtyFrom(body: unknown, symbol: string): number | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { positionsAvailable?: unknown; positions?: unknown };
  if (b.positionsAvailable !== true || !Array.isArray(b.positions)) return null;
  const want = symbol.toUpperCase();
  const p = b.positions.find(
    (x) => typeof (x as { symbol?: unknown })?.symbol === "string" && (x as { symbol: string }).symbol.toUpperCase() === want,
  ) as { qty?: unknown; side?: unknown } | undefined;
  if (!p) return 0;
  const qty = typeof p.qty === "number" ? p.qty : parseFloat(String(p.qty));
  if (!Number.isFinite(qty)) return null;
  return p.side === "short" ? -Math.abs(qty) : qty;
}

export interface ResultingPosition {
  qty: number;
  /** A dollar order's share count is an estimate at the estimate price. */
  approximate: boolean;
}

/**
 * The position left if the order fills in full. Null when the current
 * holding is unknown, or the order has no size (or, for a dollar order,
 * no price to turn dollars into shares).
 */
export function resultingPosition(
  held: number | null,
  f: TicketFields,
  quotePrice: number | null,
): ResultingPosition | null {
  if (held === null) return null;
  const sign = f.side === "buy" ? 1 : -1;
  if (f.sizingMode === "shares") {
    const q = parseFloat(f.qty);
    if (!(q > 0)) return null;
    return { qty: held + sign * q, approximate: false };
  }
  const n = parseFloat(f.notional);
  const price = estimatePrice(f, quotePrice);
  if (!(n > 0) || price === null) return null;
  return { qty: held + (sign * n) / price, approximate: true };
}

const SHARES = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** "12 shares", "1 share", "4 shares short", "None"; approximate adds "≈ ". */
export function describePosition(qty: number, approximate = false): string {
  const rounded = Math.round(qty * 1000) / 1000;
  if (rounded === 0) return "None";
  const abs = Math.abs(rounded);
  const words = `${SHARES.format(abs)} ${abs === 1 ? "share" : "shares"}${rounded < 0 ? " short" : ""}`;
  return approximate ? `≈ ${words}` : words;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * What the estimate is taken on, under the figure: "25 shares at the last
 * price, $228.40", "≈ 2 shares at your limit, $200.00". Null when there is
 * no estimate to explain.
 */
export function estimateBasis(f: TicketFields, quotePrice: number | null): string | null {
  const price = estimatePrice(f, quotePrice);
  if (price === null) return null;
  const at = usesLimitPrice(f.orderType) ? `at your limit, ${USD.format(price)}` : `at the last price, ${USD.format(price)}`;
  if (f.sizingMode === "dollars") {
    const n = parseFloat(f.notional);
    if (!(n > 0)) return null;
    return `${describePosition(n / price, true)} ${at}`;
  }
  const q = parseFloat(f.qty);
  if (!(q > 0)) return null;
  return `${describePosition(q)} ${at}`;
}

// ─── Labels ────────────────────────────────────────────────────────

export type TicketAccount = "loading" | "unknown" | "none" | "paper" | "live";

/** "Place paper buy", "Place LIVE sell"; "Place buy" while the account is not known. */
export function submitLabel(side: OrderSide, account: TicketAccount): string {
  if (account === "live") return `Place LIVE ${side}`;
  if (account === "paper") return `Place paper ${side}`;
  return `Place ${side}`;
}

/**
 * Why Place is disabled, printed under it. Undefined while loading (the
 * skeleton says that) and when it is enabled. The order matches
 * validateTicket for the engine.
 */
export function blockedReason(
  engine: "loading" | "unknown" | "running" | "stopped",
  account: TicketAccount,
): string | undefined {
  if (engine === "running") return "Engine is running, stop it first on the Trader page.";
  if (engine === "unknown") return "Engine status unknown. Retry below.";
  if (account === "unknown") return "Could not read which account is active. Retry above.";
  if (account === "none") return "No active broker connection.";
  return undefined;
}

/** How old a quote is, in words, from its fetch time. */
export function quoteAge(fetchedAt: number, now: number): string {
  const s = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** A quote older than this is marked stale and offers a refresh. */
export const QUOTE_STALE_MS = 60_000;
