/**
 * Manual flatten trade records (WP06, finding #48).
 *
 * The flatten route used to insert a FILLED manual_close row at the
 * position snapshot's price with no broker order id, add the snapshot's
 * unrealized P&L to the day's realized total at submit, and swallow an
 * insert failure. Nothing could correct the row afterwards, an after-hours
 * flatten recorded yesterday's price for a sell that filled at the next open,
 * and the broker-side exit reconciler (idempotent on the broker order id)
 * could record the same sell a second time.
 *
 * Now the row is PENDING with the broker order id and no fill price;
 * reconcilePendingTrades sets the real fill, P&L and daily total.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  userId: "user-1",
  marketOpen: true,
  positions: [] as Array<Record<string, unknown>>,
  /** Orders the broker reports back (getOrders / getOrder). */
  brokerOrders: [] as Array<Record<string, unknown>>,
  placed: [] as Array<Record<string, unknown>>,
  /** Every db.insert(table).values(v): the table name and the values. */
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<Record<string, unknown>>,
  /** trader_trades rows the fake db holds (what inserts created). */
  tradeRows: [] as Array<Record<string, unknown>>,
  /** Answer for trader_trades selects; set per test. */
  selectTrades: (() => []) as () => Array<Record<string, unknown>>,
  failTradeInsert: false,
  errors: [] as Array<{ obj: unknown; msg: unknown }>,
  /** Every .where(...) argument, with the statement kind and table. */
  wheres: [] as Array<{ kind: string; table: string; where: unknown }>,
  getOrdersCalls: 0,
}));

vi.mock("@/lib/logger", () => {
  const make = () => ({
    info: () => {},
    warn: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    error: (obj: unknown, msg?: unknown) => { state.errors.push({ obj, msg }); },
    child: () => make(),
  });
  return { logger: make(), createRouteLogger: () => make() };
});

vi.mock("@/lib/auth", () => ({
  getSession: async () => null,
  requireAuthWithCsrf: async () => ({ userId: state.userId, email: "u@example.com", role: "user" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, writeAudit: vi.fn(async () => {}) };
});

vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));

vi.mock("@/lib/journal-auto-stub", () => ({ createAutoJournalStub: async () => {} }));

vi.mock("@/lib/market-hours", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/market-hours")>();
  return { ...actual, isMarketOpen: () => state.marketOpen };
});

vi.mock("@/lib/db", async () => {
  const { getTableName } = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  function chain(kind: string, first?: unknown): unknown {
    let table = "";
    let setPayload: Record<string, unknown> | null = null;
    if (kind === "insert" || kind === "update") table = getTableName(first as never);
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
              if (kind === "insert" && table === "trader_trades" && state.failTradeInsert) {
                reject(new Error("connection terminated"));
                return;
              }
              if (kind === "select") {
                resolve(table === "trader_trades" ? state.selectTrades() : [
                  { id: "conn-1", userId: state.userId, broker: "alpaca", environment: "paper", isActive: true, apiKey: "k", apiSecret: "s" },
                ]);
                return;
              }
              if (kind === "update" && setPayload) {
                const open = state.tradeRows.find((r) => r.status === "PENDING");
                if (!open) { resolve([]); return; }
                Object.assign(open, setPayload);
                state.updates.push(setPayload);
                resolve([{ id: open.id }]);
                return;
              }
              resolve([]);
            };
          }
          return (...args: unknown[]) => {
            if (prop === "from") table = getTableName(args[0] as never);
            if (prop === "set") setPayload = args[0] as Record<string, unknown>;
            if (prop === "where") state.wheres.push({ kind, table, where: args[0] });
            if (prop === "values") {
              const values = args[0] as Record<string, unknown>;
              state.inserts.push({ table, values });
              if (table === "trader_trades" && !state.failTradeInsert) {
                state.tradeRows.push({ id: `row-${state.tradeRows.length + 1}`, ...values });
              }
            }
            return proxy;
          };
        },
      }
    );
    return proxy;
  }
  const db = new Proxy({}, { get: (_t, prop) => (arg?: unknown) => chain(String(prop), arg) });
  return { db, withTimeout: <T,>(p: Promise<T>) => p, isStatementTimeout: () => false };
});

vi.mock("@/lib/brokers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brokers")>();
  return {
    ...actual,
    createBrokerClient: () => fakeClient(),
  };
});

function fakeClient() {
  return {
    broker: "alpaca",
    environment: "paper",
    getPositions: async () => state.positions,
    getOrders: async () => {
      state.getOrdersCalls++;
      return state.brokerOrders.map((o) => ({ ...o }));
    },
    getOrder: async (id: string) => state.brokerOrders.find((o) => o.id === id) ?? null,
    cancelOrder: async () => {},
    cancelAllOrders: async () => {},
    placeOrder: async (params: Record<string, unknown>) => {
      state.placed.push(params);
      return { id: `ord-${params.symbol as string}`, status: "accepted" };
    },
  };
}

import { POST } from "@/app/api/trader/command/route";
import {
  reconcilePendingTrades,
  reconcileBrokerSideExit,
  reconcileManualClosesIfEngineStopped,
  getEngineStatus,
  type EngineState,
} from "@/lib/trading-engine";
import type { BrokerClient } from "@/lib/brokers";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

/** The SQL text and params of the last .where(...) of one kind on one table. */
function lastWhere(kind: string, table: string): { sql: string; params: unknown[] } {
  const w = [...state.wheres].reverse().find((x) => x.kind === kind && x.table === table);
  if (!w) throw new Error(`no ${kind} where on ${table}`);
  return new PgDialect().sqlToQuery(w.where as SQL);
}

let seq = 0;

function flattenRequest(symbol?: string): NextRequest {
  return new NextRequest("http://localhost/api/trader/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(symbol ? { command: "flatten", symbol } : { command: "flatten" }),
  });
}

const AAPL = { symbol: "AAPL", qty: 10, avgEntryPrice: 200, currentPrice: 190, unrealizedPnl: -100 };
const MSFT = { symbol: "MSFT", qty: 5, avgEntryPrice: 400, currentPrice: 410, unrealizedPnl: 50 };

function tradeInserts() {
  return state.inserts.filter((i) => i.table === "trader_trades").map((i) => i.values);
}
function dailyPnlInserts() {
  return state.inserts.filter((i) => i.table === "trader_daily_pnl").map((i) => i.values);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  seq++;
  state.userId = `00000000-0000-4000-8000-${String(500000 + seq).padStart(12, "0")}`;
  state.marketOpen = true;
  state.positions = [AAPL, MSFT];
  state.brokerOrders = [];
  state.placed = [];
  state.inserts = [];
  state.updates = [];
  state.tradeRows = [];
  state.selectTrades = () => [];
  state.failTradeInsert = false;
  state.errors = [];
  state.wheres = [];
  state.getOrdersCalls = 0;
  return () => { vi.useRealTimers(); };
});

describe("flatten records a PENDING row the reconciler can correct (finding #48)", () => {
  it("inserts manual_close PENDING with the broker order id and no fill price", async () => {
    const res = await POST(flattenRequest("AAPL"));
    expect(res.status).toBe(200);

    expect(tradeInserts()).toEqual([
      expect.objectContaining({
        action: "manual_close",
        status: "PENDING",
        brokerOrderId: "ord-AAPL",
        fillPrice: null,
        placeholderFillPrice: 190,
        pnl: -100,
        quantity: 10,
      }),
    ]);
  });

  it("writes nothing to the daily P&L total at submit, for one or all", async () => {
    await POST(flattenRequest("AAPL"));
    await POST(flattenRequest());

    expect(tradeInserts()).toHaveLength(3);
    expect(dailyPnlInserts()).toHaveLength(0);
  });

  it("logs an error with the broker order id when the row insert fails", async () => {
    state.failTradeInsert = true;

    const res = await POST(flattenRequest("AAPL"));
    expect(res.status).toBe(200); // the sell was placed; only its record failed

    const logged = state.errors.find((e) => (e.obj as { brokerOrderId?: string }).brokerOrderId === "ord-AAPL");
    expect(logged).toBeDefined();
    expect((logged!.obj as { err: string }).err).toBe("connection terminated");
  });

  it("with the market closed, still places the sells but reports them queued for the open", async () => {
    state.marketOpen = false;

    const res = await POST(flattenRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(state.placed.map((p) => p.symbol)).toEqual(["AAPL", "MSFT"]);
    expect(body.queuedForOpen).toBe(true);
    expect(body.message).toMatch(/queued/i);
    expect(body.closed).toEqual([
      expect.objectContaining({ symbol: "AAPL", status: "queued" }),
      expect.objectContaining({ symbol: "MSFT", status: "queued" }),
    ]);
    expect(tradeInserts().every((v) => v.status === "PENDING")).toBe(true);
  });
});

describe("reconciling a manual flatten row", () => {
  it("sets the real fill and P&L and adds it to the daily total on the fill date", async () => {
    await POST(flattenRequest("AAPL"));
    state.selectTrades = () => state.tradeRows.filter((r) => r.status === "PENDING").map((r) => ({ ...r }));
    // Queued at a $190 snapshot, filled at $185 at the next open.
    state.brokerOrders = [
      { id: "ord-AAPL", symbol: "AAPL", side: "sell", status: "filled", filledPrice: 185, filledAt: "2026-09-24T13:30:05Z" },
    ];

    await reconcilePendingTrades(fakeClient() as unknown as BrokerClient, state.userId);

    // -$100 at the snapshot, plus (185 - 190) x 10 = -$150.
    expect(state.tradeRows[0]).toMatchObject({ status: "FILLED", fillPrice: 185, pnl: -150 });
    expect(dailyPnlInserts()).toEqual([
      expect.objectContaining({ userId: state.userId, date: "2026-09-24", realizedPnl: -150, tradesCount: 1 }),
    ]);
  });

  it("a canceled flatten adds nothing to the daily total", async () => {
    await POST(flattenRequest("AAPL"));
    state.selectTrades = () => state.tradeRows.filter((r) => r.status === "PENDING").map((r) => ({ ...r }));
    state.brokerOrders = [{ id: "ord-AAPL", symbol: "AAPL", side: "sell", status: "canceled", filledPrice: null, filledAt: null }];

    await reconcilePendingTrades(fakeClient() as unknown as BrokerClient, state.userId);

    expect(state.tradeRows[0]).toMatchObject({ status: "CANCELED", pnl: null });
    expect(dailyPnlInserts()).toHaveLength(0);
  });

  it("the broker-side exit reconciler does not add a second SELL row for the same order", async () => {
    await POST(flattenRequest("AAPL"));
    // SELECT id FROM trader_trades WHERE user_id = ? AND broker_order_id = ?
    // for the fill the broker reports.
    state.brokerOrders = [
      { id: "ord-AAPL", symbol: "AAPL", side: "sell", status: "filled", type: "market", filledQty: 10, filledPrice: 185, filledAt: new Date().toISOString() },
    ];
    state.selectTrades = () =>
      state.tradeRows.filter((r) => r.userId === state.userId && r.brokerOrderId === "ord-AAPL").map((r) => ({ id: r.id }));
    const before = tradeInserts().length;

    const tracked = { symbol: "AAPL", qty: 10, entryPrice: 200 };
    await reconcileBrokerSideExit(
      fakeClient() as unknown as BrokerClient,
      "AAPL",
      tracked as unknown as Parameters<typeof reconcileBrokerSideExit>[2],
      state.userId,
    );

    expect(tradeInserts()).toHaveLength(before);
  });
});

// ─── Manual flatten rows settle without the engine (WP06 review) ────────────

const PENDING_ROWS = () => state.tradeRows.filter((r) => r.status === "PENDING").map((r) => ({ ...r }));

describe("the route's post-flatten reconcile pass", () => {
  it("during regular hours, runs one manual-close pass after 3 s", async () => {
    await POST(flattenRequest("AAPL"));
    state.selectTrades = PENDING_ROWS;
    state.brokerOrders = [
      { id: "ord-AAPL", symbol: "AAPL", side: "sell", status: "filled", filledPrice: 189, filledAt: new Date().toISOString() },
    ];
    const callsAfterSubmit = state.getOrdersCalls;

    await vi.advanceTimersByTimeAsync(2999);
    expect(state.getOrdersCalls).toBe(callsAfterSubmit);
    await vi.advanceTimersByTimeAsync(1);
    // Join the pass the timer started, so the assertions see it finished.
    await reconcilePendingTrades(fakeClient() as unknown as BrokerClient, state.userId, { manualCloseOnly: true });

    expect(state.getOrdersCalls).toBe(callsAfterSubmit + 1);
    expect(state.tradeRows[0]).toMatchObject({ status: "FILLED", fillPrice: 189 });
    expect(lastWhere("select", "trader_trades").params).toContain("manual_close");
  });

  it("outside regular hours (queued for the open), schedules nothing", async () => {
    state.marketOpen = false;
    await POST(flattenRequest("AAPL"));
    const callsAfterSubmit = state.getOrdersCalls;

    await vi.advanceTimersByTimeAsync(10_000);

    expect(state.getOrdersCalls).toBe(callsAfterSubmit);
    expect(state.tradeRows[0]).toMatchObject({ status: "PENDING" });
  });
});

describe("engine stopped, after-hours flatten", () => {
  it("the dashboard's pass settles the row and books the fill once the sell fills", async () => {
    state.marketOpen = false;
    await POST(flattenRequest());
    expect(state.tradeRows.map((r) => r.status)).toEqual(["PENDING", "PENDING"]);

    // The engine is not running. The sells fill at the next open.
    state.selectTrades = PENDING_ROWS;
    state.brokerOrders = [
      { id: "ord-AAPL", symbol: "AAPL", side: "sell", status: "filled", filledPrice: 185, filledAt: "2026-09-24T13:30:05Z" },
      { id: "ord-MSFT", symbol: "MSFT", side: "sell", status: "filled", filledPrice: 412, filledAt: "2026-09-24T13:30:06Z" },
    ];
    const client = fakeClient() as unknown as BrokerClient;
    reconcileManualClosesIfEngineStopped(client, state.userId);
    await reconcilePendingTrades(client, state.userId, { manualCloseOnly: true });

    expect(state.tradeRows.map((r) => r.status)).toEqual(["FILLED", "FILLED"]);
    expect(dailyPnlInserts()).toEqual([
      expect.objectContaining({ date: "2026-09-24", realizedPnl: -150, tradesCount: 1 }),
      expect.objectContaining({ date: "2026-09-24", realizedPnl: 60, tradesCount: 1 }),
    ]);

    // The pass selects manual_close rows with no createdAt cutoff, so a row
    // older than the 7-day lookback is still reached.
    const select = lastWhere("select", "trader_trades");
    expect(select.sql).toContain('"action" = ');
    expect(select.sql).not.toContain('"created_at"');
    expect(select.params).toContain("manual_close");
  });

  it("is throttled per user, and does nothing while the engine runs", async () => {
    const client = fakeClient() as unknown as BrokerClient;
    reconcileManualClosesIfEngineStopped(client, state.userId);
    await reconcilePendingTrades(client, state.userId, { manualCloseOnly: true });
    const selects = () => state.wheres.filter((w) => w.kind === "select" && w.table === "trader_trades").length;
    const afterFirst = selects();

    reconcileManualClosesIfEngineStopped(client, state.userId);
    expect(selects()).toBe(afterFirst);

    const other = `${state.userId.slice(0, -1)}f`;
    getEngineStatus(other);
    const engine = (globalThis as typeof globalThis & { __tradingEngines?: Map<string, EngineState> })
      .__tradingEngines!.get(other)!;
    engine.running = true;
    try {
      reconcileManualClosesIfEngineStopped(client, other);
      expect(selects()).toBe(afterFirst);
    } finally {
      engine.running = false;
    }
  });
});

describe("reconcile select and fence", () => {
  it("a full pass keeps the 7-day cutoff for engine rows but exempts manual_close", async () => {
    await reconcilePendingTrades(fakeClient() as unknown as BrokerClient, state.userId);

    const select = lastWhere("select", "trader_trades");
    expect(select.sql).toMatch(/\("trader_trades"\."created_at" > \$\d+ or "trader_trades"\."action" = \$\d+\)/);
    expect(select.params).toContain("manual_close");
  });

  it("the UPDATE is fenced on id, owner and a still-open status", async () => {
    await POST(flattenRequest("AAPL"));
    state.selectTrades = PENDING_ROWS;
    state.brokerOrders = [
      { id: "ord-AAPL", symbol: "AAPL", side: "sell", status: "filled", filledPrice: 185, filledAt: new Date().toISOString() },
    ];
    await reconcilePendingTrades(fakeClient() as unknown as BrokerClient, state.userId, { manualCloseOnly: true });

    const update = lastWhere("update", "trader_trades");
    expect(update.sql).toMatch(/"trader_trades"\."id" = \$\d+/);
    expect(update.sql).toMatch(/"trader_trades"\."user_id" = \$\d+/);
    expect(update.sql).toMatch(/"trader_trades"\."status" in \(\$\d+, \$\d+\)/);
    expect(update.params).toEqual(expect.arrayContaining(["row-1", state.userId, "PENDING", "PARTIAL_FILLED"]));
  });

  it("a full pass that meets a running manual-close pass runs after it; a second manual call joins", async () => {
    const client = fakeClient() as unknown as BrokerClient;
    const manual = reconcilePendingTrades(client, state.userId, { manualCloseOnly: true });
    const manualAgain = reconcilePendingTrades(client, state.userId, { manualCloseOnly: true });
    const full = reconcilePendingTrades(client, state.userId);
    await Promise.all([manual, manualAgain, full]);

    const selects = state.wheres
      .filter((w) => w.kind === "select" && w.table === "trader_trades")
      .map((w) => new PgDialect().sqlToQuery(w.where as SQL).sql);
    expect(selects).toHaveLength(2);
    expect(selects[0]).not.toContain('"created_at"');
    expect(selects[1]).toContain('"created_at"');
  });
});
