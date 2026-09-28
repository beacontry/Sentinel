/**
 * Scan-end unrealized P&L when the broker positions fetch fails (WP06,
 * finding #10).
 *
 * The tactical scans summed unrealized P&L inside `catch { /* use 0 *\/ }`,
 * so a 429 or a timeout on GET /v2/positions wrote today's unrealized P&L as
 * 0 and ran the mark-to-market halt against 0. recordScanEndPnl keeps the
 * figure unknown: upsertDailyPnl gets null (the stored value is preserved)
 * and the halt runs against the start-of-scan positions instead.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** Each db.insert(...).values(...) payload. */
  inserts: [] as Array<Record<string, unknown>>,
  /** Each onConflictDoUpdate({ set }) payload. */
  conflictSets: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db", () => {
  function chain(): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => void) => resolve([]);
          return (...args: unknown[]) => {
            if (prop === "values") state.inserts.push(args[0] as Record<string, unknown>);
            if (prop === "onConflictDoUpdate") {
              state.conflictSets.push((args[0] as { set: Record<string, unknown> }).set);
            }
            return proxy;
          };
        },
      }
    );
    return proxy;
  }
  const db = new Proxy({}, { get: () => () => chain() });
  return { db, withTimeout: <T,>(p: Promise<T>) => p, isStatementTimeout: () => false };
});

vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, writeAudit: vi.fn(async () => {}) };
});

import { recordScanEndPnl, getEngineStatus, type EngineState } from "@/lib/trading-engine";
import type { BrokerClient, BrokerPosition } from "@/lib/brokers";

const g = globalThis as typeof globalThis & { __tradingEngines?: Map<string, EngineState> };

let userSeq = 0;
function runningEngine(): EngineState {
  userSeq++;
  const userId = `00000000-0000-4000-8000-${String(700000 + userSeq).padStart(12, "0")}`;
  getEngineStatus(userId);
  const engine = g.__tradingEngines!.get(userId)!;
  engine.userId = userId;
  engine.running = true;
  engine.halted = false;
  engine.dailyLoss = 0;
  return engine;
}

function position(symbol: string, unrealizedPnl: number): BrokerPosition {
  return { symbol, qty: 10, avgEntryPrice: 100, currentPrice: 100 + unrealizedPnl / 10, marketValue: 1000, unrealizedPnl } as unknown as BrokerPosition;
}

function client(getPositions: () => Promise<BrokerPosition[]>): BrokerClient {
  return { getPositions } as unknown as BrokerClient;
}

const failing = client(async () => { throw new Error("Alpaca 429: rate limited"); });

// Equity 10k, default dailyLossPct 2%: realized threshold $200, MTM threshold $300.
const EQUITY = 10_000;

beforeEach(() => {
  state.inserts = [];
  state.conflictSets = [];
});

describe("recordScanEndPnl: positions fetch failure (finding #10)", () => {
  it("passes null unrealized to the daily row, so the stored value is not overwritten with 0", async () => {
    const engine = runningEngine();

    await recordScanEndPnl(engine, failing, [position("AAPL", -50)], EQUITY, "2026-09-23", 0, 0);

    expect(state.conflictSets).toHaveLength(1);
    expect(state.conflictSets[0]).not.toHaveProperty("unrealizedPnl");
  });

  it("runs the MTM halt against the start-of-scan positions, not 0", async () => {
    const engine = runningEngine();

    // -$400 open loss at scan start is past the $300 MTM threshold. Evaluated
    // against a fabricated 0 it would not halt.
    await recordScanEndPnl(engine, failing, [position("AAPL", -250), position("MSFT", -150)], EQUITY, "2026-09-23", 0, 0);

    expect(engine.halted).toBe(true);
    expect(engine.haltReason).toBe("daily_loss");
  });

  it("does not halt when the start-of-scan loss is inside the threshold", async () => {
    const engine = runningEngine();

    await recordScanEndPnl(engine, failing, [position("AAPL", -100)], EQUITY, "2026-09-23", 0, 0);

    expect(engine.halted).toBe(false);
  });

  it("a successful fetch writes the fresh unrealized figure and checks the halt against it", async () => {
    const engine = runningEngine();

    await recordScanEndPnl(
      engine,
      client(async () => [position("AAPL", -350)]),
      [position("AAPL", 20)],
      EQUITY,
      "2026-09-23",
      0,
      0,
    );

    expect(state.conflictSets[0]).toMatchObject({ unrealizedPnl: -350 });
    expect(engine.halted).toBe(true);
  });
});

describe("recordScanEndPnl: the fallback leaves out what the scan sold", () => {
  it("does not count a loser sold this scan twice (realized in dailyLoss and again as unrealized)", async () => {
    const engine = runningEngine();
    // The scan sold AAPL at -$150, already accrued to dailyLoss. True MTM is
    // -$150 + MSFT's -$100 = -$250, inside the $300 threshold. Counting AAPL
    // again from the start-of-scan list would make it -$400 and halt.
    engine.dailyLoss = -150;

    await recordScanEndPnl(
      engine,
      failing,
      [position("AAPL", -150), position("MSFT", -100)],
      EQUITY,
      "2026-09-23",
      -150,
      1,
      new Set(["AAPL"]),
    );

    expect(engine.halted).toBe(false);
  });

  it("still halts on the positions it kept", async () => {
    const engine = runningEngine();
    engine.dailyLoss = -150;

    await recordScanEndPnl(
      engine,
      failing,
      [position("AAPL", -150), position("MSFT", -200)],
      EQUITY,
      "2026-09-23",
      -150,
      1,
      new Set(["AAPL"]),
    );

    expect(engine.halted).toBe(true);
  });
});
