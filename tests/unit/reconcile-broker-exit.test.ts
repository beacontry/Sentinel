/**
 * Phase 7.5 — tests for the broker-side exit reconciliation candidate
 * selection. The actual reconcileBrokerSideExit() function isn't exported
 * (it does DB writes which would need a full mock layer); we replicate the
 * candidate-selection logic here and pin its behavior independently.
 *
 * If trading-engine.ts changes the selection rules, update this mirror to
 * match — same pattern as engine-safeguards.test.ts.
 */

import { describe, it, expect } from "vitest";

interface MockOrder {
  id: string;
  symbol: string;
  side: string;
  status: string;
  type: string;
  filledQty: number;
  filledPrice: number | null;
  filledAt: string | null;
  stopPrice: string | null;
}

function findReconciliationCandidate(
  closedOrders: MockOrder[],
  symbol: string,
  expectedQty: number,
  now: number = Date.now()
): MockOrder | null {
  // Mirrors RECONCILE_LOOKBACK_MS (7 days) — widened from 1 hour (audit #43)
  // so a GTC protective stop that fires overnight/over a weekend is still
  // matched by the next market-hours sync.
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const matches = closedOrders.filter(
    (o) =>
      o.symbol === symbol &&
      o.side === "sell" &&
      o.status === "filled" &&
      Number(o.filledQty) === expectedQty &&
      o.filledAt &&
      new Date(o.filledAt).getTime() > cutoff
  );
  return matches.sort(
    (a, b) => new Date(b.filledAt!).getTime() - new Date(a.filledAt!).getTime()
  )[0] ?? null;
}

const NOW = new Date("2026-05-11T19:43:54Z").getTime(); // TGT incident reference time

function order(overrides: Partial<MockOrder> = {}): MockOrder {
  return {
    id: "o1",
    symbol: "TGT",
    side: "sell",
    status: "filled",
    type: "stop",
    filledQty: 29,
    filledPrice: 117.669655,
    filledAt: new Date(NOW).toISOString(),
    stopPrice: "117.70",
    ...overrides,
  };
}

describe("reconcileBrokerSideExit — candidate selection (Phase 7.5)", () => {
  it("picks the exact stop fill that closed the position", () => {
    const orders = [order()];
    const c = findReconciliationCandidate(orders, "TGT", 29, NOW + 1000);
    expect(c?.id).toBe("o1");
  });

  it("returns null when no orders match", () => {
    expect(findReconciliationCandidate([], "TGT", 29, NOW)).toBeNull();
  });

  it("ignores BUYs (only SELLs matter for exit reconciliation)", () => {
    const orders = [order({ side: "buy" })];
    expect(findReconciliationCandidate(orders, "TGT", 29, NOW + 1000)).toBeNull();
  });

  it("ignores non-filled statuses (canceled, expired, pending)", () => {
    const orders = [
      order({ id: "canceled", status: "canceled" }),
      order({ id: "expired", status: "expired" }),
      order({ id: "pending_new", status: "pending_new" }),
    ];
    expect(findReconciliationCandidate(orders, "TGT", 29, NOW + 1000)).toBeNull();
  });

  it("ignores fills with wrong qty (different position)", () => {
    // A historical partial close left an old 5-share fill on the books;
    // we're now closing the remaining 29 shares — pick only the 29-share fill.
    const orders = [
      order({ id: "old_5", filledQty: 5, filledAt: new Date(NOW - 30 * 60 * 1000).toISOString() }),
      order({ id: "current_29", filledQty: 29 }),
    ];
    const c = findReconciliationCandidate(orders, "TGT", 29, NOW + 1000);
    expect(c?.id).toBe("current_29");
  });

  it("ignores fills older than the 7-day reconciliation window", () => {
    const orders = [
      order({ id: "stale", filledAt: new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString() }),
    ];
    expect(findReconciliationCandidate(orders, "TGT", 29, NOW + 1000)).toBeNull();
  });

  it("matches an overnight/weekend fill hours-to-days old (audit #43 widened window)", () => {
    // The bug: a GTC stop firing overnight was >1h old by the next market-hours
    // sync, so it was dropped. The 7-day window now catches it.
    const orders = [
      order({ id: "overnight", filledAt: new Date(NOW - 18 * 60 * 60 * 1000).toISOString() }),
      order({ id: "weekend", filledAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString() }),
    ];
    const c = findReconciliationCandidate(orders, "TGT", 29, NOW + 1000);
    expect(c?.id).toBe("overnight"); // most recent of the two matches
  });

  it("picks the MOST RECENT fill when multiple match", () => {
    const orders = [
      order({ id: "earlier", filledAt: new Date(NOW - 30 * 60 * 1000).toISOString() }),
      order({ id: "latest", filledAt: new Date(NOW - 5 * 60 * 1000).toISOString() }),
      order({ id: "middle", filledAt: new Date(NOW - 15 * 60 * 1000).toISOString() }),
    ];
    const c = findReconciliationCandidate(orders, "TGT", 29, NOW + 1000);
    expect(c?.id).toBe("latest");
  });

  it("matches stop_limit fills too (not just stop)", () => {
    const orders = [order({ type: "stop_limit" })];
    const c = findReconciliationCandidate(orders, "TGT", 29, NOW + 1000);
    expect(c?.id).toBe("o1");
  });

  it("matches market sells too (e.g., manual flatten that engine didn't log)", () => {
    const orders = [order({ type: "market" })];
    const c = findReconciliationCandidate(orders, "TGT", 29, NOW + 1000);
    expect(c?.id).toBe("o1");
  });

  it("orders for other symbols ignored", () => {
    const orders = [order({ symbol: "AAPL" })];
    expect(findReconciliationCandidate(orders, "TGT", 29, NOW + 1000)).toBeNull();
  });

  it("the actual TGT 2026-05-11 scenario produces the right candidate", () => {
    // Real data from the incident:
    //   stop @ $117.70 filled at $117.669655 at 19:43:54Z on May 11
    //   no other matching orders
    // Reconciliation should select this for the missing trader_trades row.
    const orders = [
      order({
        id: "6f0f608e-518f-41b9-b15e-4b2d476c972c",
        type: "stop",
        filledQty: 29,
        filledPrice: 117.669655,
        filledAt: "2026-05-11T19:43:54.412038Z",
        stopPrice: "117.70",
      }),
    ];
    const checkTime = new Date("2026-05-11T19:50:00Z").getTime(); // a few minutes later
    const c = findReconciliationCandidate(orders, "TGT", 29, checkTime);
    expect(c?.id).toBe("6f0f608e-518f-41b9-b15e-4b2d476c972c");
    expect(c?.filledPrice).toBe(117.669655);
    // P&L computation
    const entryPrice = 130.32;
    const pnl = (c!.filledPrice! - entryPrice) * 29;
    expect(pnl).toBeCloseTo(-366.86, 2);
  });
});
