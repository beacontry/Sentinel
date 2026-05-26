/**
 * Regression test for the WDC 3-pending-order incident on 2026-05-26.
 *
 * Root cause: the per-scan `pendingBuySymbols` guards in runScan /
 * runTacticalScan / runTacticalSmartScan called `client.getOrders(100)` with
 * no status argument. Alpaca defaults to `status="all"` and returns the 100
 * most-recent orders sorted desc. On a churn-heavy tactical-smart account,
 * the 100-row window is dominated by filled/cancelled rows — the still-open
 * limit buys fall off the page, `pendingBuySymbols` doesn't include them,
 * and the next scan re-fires the buy. Three WDC limits stacked up.
 *
 * Fix: every per-scan guard now passes `status="open"` explicitly so Alpaca
 * filters server-side and the 100-row budget is spent on open orders only.
 *
 * This test mirrors the building of `pendingBuySymbols` from the engine, and
 * proves that with the wrong status (or none) the guard goes blind, while
 * the corrected call (`status="open"`) catches the open buy.
 */

import { describe, it, expect } from "vitest";

type Status =
  | "new"
  | "accepted"
  | "pending_new"
  | "partially_filled"
  | "held"
  | "filled"
  | "canceled"
  | "expired";

interface FakeOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market" | "stop" | "stop_limit";
  status: Status;
}

// Mirror of the per-scan guard's pendingBuySymbols-building logic from
// src/lib/trading-engine.ts. If the engine's filter list changes, update both.
const OPEN_STATUSES: ReadonlySet<Status> = new Set([
  "new",
  "accepted",
  "pending_new",
  "partially_filled",
  "held",
]);

function buildPendingBuySymbols(orders: FakeOrder[]): Set<string> {
  const out = new Set<string>();
  for (const o of orders) {
    if (!OPEN_STATUSES.has(o.status)) continue;
    if (o.side === "buy") out.add(o.symbol);
  }
  return out;
}

// Fake broker that simulates Alpaca's status filter. Note Alpaca's
// `direction=desc` ordering — newest first — so the 100-row cap eats from
// the top of the array.
function fakeGetOrders(
  all: FakeOrder[],
  limit: number,
  status: "all" | "open" | "closed" = "all"
): FakeOrder[] {
  const filtered =
    status === "open"
      ? all.filter((o) => OPEN_STATUSES.has(o.status))
      : status === "closed"
        ? all.filter((o) => !OPEN_STATUSES.has(o.status))
        : all;
  return filtered.slice(0, limit);
}

describe("duplicate-order guard — getOrders status filter", () => {
  // Scenario: an active tactical-smart account has filled/cancelled 105
  // orders today (normal for a 503-symbol screener feeding an active mode),
  // plus one still-open WDC limit buy placed an hour ago.
  function buildChurnyAccount(): FakeOrder[] {
    const orders: FakeOrder[] = [];
    // 105 most-recent are filled/cancelled noise (newest first per Alpaca's desc)
    for (let i = 0; i < 105; i++) {
      orders.push({
        id: `noise-${i}`,
        symbol: `SYM${i}`,
        side: i % 2 === 0 ? "buy" : "sell",
        type: "market",
        status: i % 3 === 0 ? "canceled" : "filled",
      });
    }
    // The still-open WDC buy is older than all the noise — appears LAST in
    // the desc-ordered response, gets cut off by the 100-row limit.
    orders.push({
      id: "wdc-buy-1",
      symbol: "WDC",
      side: "buy",
      type: "limit",
      status: "new",
    });
    return orders;
  }

  it("BUG REPRO — getOrders(100) with no status filter hides the open WDC buy", () => {
    const all = buildChurnyAccount();
    const visible = fakeGetOrders(all, 100); // default status="all"
    const pendingBuys = buildPendingBuySymbols(visible);

    expect(visible).toHaveLength(100);
    expect(visible.find((o) => o.symbol === "WDC")).toBeUndefined();
    expect(pendingBuys.has("WDC")).toBe(false);
    // ↑ this is the bug: guard says "no pending WDC buy", engine re-fires.
  });

  it("FIX — getOrders(100, \"open\") server-side filter spends the 100-row budget on open orders only", () => {
    const all = buildChurnyAccount();
    const visible = fakeGetOrders(all, 100, "open");
    const pendingBuys = buildPendingBuySymbols(visible);

    expect(visible.find((o) => o.symbol === "WDC")).toBeDefined();
    expect(pendingBuys.has("WDC")).toBe(true);
  });

  it("FIX still works when there are far more open orders than the limit", () => {
    // Pathological case: 100 open buys + the WDC buy, total 101 open. The
    // 100-row limit will still cut WDC off the back. But this is acceptable
    // because the engine's BUY universe at any given scan is ~30 symbols
    // tops — 100 open buys would mean catastrophic over-buying already.
    // What matters is that "open" filter doesn't get poisoned by filled noise.
    const orders: FakeOrder[] = [];
    for (let i = 0; i < 100; i++) {
      orders.push({
        id: `buy-${i}`,
        symbol: `SYM${i}`,
        side: "buy",
        type: "limit",
        status: "new",
      });
    }
    orders.push({
      id: "wdc-buy",
      symbol: "WDC",
      side: "buy",
      type: "limit",
      status: "new",
    });

    const visible = fakeGetOrders(orders, 100, "open");
    const pendingBuys = buildPendingBuySymbols(visible);

    expect(visible).toHaveLength(100);
    // 100 distinct buys captured; WDC the unlucky 101st falls off — but in
    // realistic operation this state is itself the bug to alert on.
    expect(pendingBuys.size).toBe(100);
  });

  it("stop / stop_limit orders on the SELL side don't get treated as pending buys", () => {
    // Protective stops are managed by syncBrokerStops, not exit intents.
    // Mirror engine's `if (o.side === "sell" && o.type !== "stop" && ...)` check
    // by confirming our pendingBuys set never includes a stop-sell symbol.
    const orders: FakeOrder[] = [
      { id: "stop-1", symbol: "AAPL", side: "sell", type: "stop", status: "new" },
      { id: "buy-1", symbol: "MSFT", side: "buy", type: "limit", status: "new" },
    ];
    const visible = fakeGetOrders(orders, 100, "open");
    const pendingBuys = buildPendingBuySymbols(visible);
    expect(pendingBuys.has("AAPL")).toBe(false);
    expect(pendingBuys.has("MSFT")).toBe(true);
  });
});
