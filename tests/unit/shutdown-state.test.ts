/**
 * Shutdown ownership after SIGTERM (WP03 follow-up).
 *
 * With NEXT_MANUAL_SIG_HANDLE=true nothing closes the HTTP server, so routes
 * keep serving during the drain. A Start or Switch there runs
 * placeDisasterStops' cancel-all with the exit about to land. These check:
 *   - runShutdownOnce sets the flag before the drain starts and runs one
 *     drain however many signals arrive;
 *   - start, switch, manual orders and flatten answer 503 SHUTTING_DOWN
 *     without reaching the engine or broker, while stop and halt still work;
 *   - instrumentation.ts routes both signals through runShutdownOnce.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  startCalls: 0,
  stopCalls: 0,
  haltCalls: 0,
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => null,
  requireAuthWithCsrf: async () => ({ userId: "11111111-1111-4111-8111-111111111111", email: "u@example.com", role: "admin" }),
  requireAuthForRead: async () => ({ userId: "11111111-1111-4111-8111-111111111111", email: "u@example.com", role: "admin" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, writeAudit: vi.fn(async () => {}) };
});

vi.mock("@/lib/db", () => {
  const chain: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve([]);
      return () => chain;
    },
  });
  return { db: new Proxy({}, { get: () => () => chain }), withTimeout: <T,>(p: Promise<T>) => p, isStatementTimeout: () => false };
});

vi.mock("@/lib/brokers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brokers")>();
  return {
    ...actual,
    createBrokerClient: () => {
      throw new Error("broker must not be reached during shutdown");
    },
  };
});

vi.mock("@/lib/trading-engine", () => ({
  startEngine: vi.fn(async () => {
    state.startCalls++;
    return { ok: true };
  }),
  stopEngine: vi.fn(async () => {
    state.stopCalls++;
    return { ok: true };
  }),
  haltEngine: vi.fn(async () => {
    state.haltCalls++;
    return { ok: true, closedSymbols: [], environment: "paper" };
  }),
  getEngineStatus: () => ({ running: false, halted: false, mode: "optimized" }),
  peekEngineStatus: () => ({ running: false }),
  reserveManualFlatten: () => ({ release: () => {} }),
  cancelAllAndWait: vi.fn(),
  cancelSymbolOrdersAndWait: vi.fn(),
  HALT_BROKER_UNRESOLVED: "BROKER_UNRESOLVED",
  HALT_LIQUIDATION_FAILED: "LIQUIDATION_FAILED",
  HALT_MARKET_CLOSED: "MARKET_CLOSED",
}));

import {
  runShutdownOnce,
  isShuttingDown,
  resetShutdownStateForTests,
  SHUTTING_DOWN_CODE,
} from "@/lib/shutdown-state";
import { POST as traderEnginePOST } from "@/app/api/trader/engine/route";
import { POST as adminEnginePOST } from "@/app/api/admin/engine/route";
import { POST as brokerOrdersPOST } from "@/app/api/broker/orders/route";
import { POST as traderCommandPOST } from "@/app/api/trader/command/route";

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectShuttingDown(res: Response) {
  expect(res.status).toBe(503);
  expect(res.headers.get("Retry-After")).toBeTruthy();
  const body = await res.json();
  expect(body.code).toBe(SHUTTING_DOWN_CODE);
  expect(body.retryable).toBe(true);
}

beforeEach(() => {
  resetShutdownStateForTests();
  state.startCalls = 0;
  state.stopCalls = 0;
  state.haltCalls = 0;
});

describe("runShutdownOnce", () => {
  it("sets the flag before the drain starts", () => {
    let seen: boolean | null = null;
    runShutdownOnce(async () => {
      seen = isShuttingDown();
    });
    expect(seen).toBe(true);
    expect(isShuttingDown()).toBe(true);
  });

  it("runs one drain; a second signal gets the drain in progress", async () => {
    let runs = 0;
    let finish!: () => void;
    const drain = () => {
      runs++;
      return new Promise<void>((r) => {
        finish = r;
      });
    };
    const first = runShutdownOnce(drain);
    const second = runShutdownOnce(drain);
    expect(first.first).toBe(true);
    expect(second.first).toBe(false);
    expect(second.done).toBe(first.done);
    expect(runs).toBe(1);
    finish();
    await second.done;
  });
});

describe("routes during shutdown", () => {
  beforeEach(() => {
    runShutdownOnce(() => new Promise(() => {}));
  });

  for (const action of ["start", "switch"]) {
    it(`trader engine ${action} answers 503 and never starts the engine`, async () => {
      await expectShuttingDown(await traderEnginePOST(post("/api/trader/engine", { action })));
      expect(state.startCalls).toBe(0);
      expect(state.stopCalls).toBe(0);
    });

    it(`admin engine ${action} answers 503 and never starts the engine`, async () => {
      const res = await adminEnginePOST(
        post("/api/admin/engine", { action, targetUserId: "22222222-2222-4222-8222-222222222222" })
      );
      await expectShuttingDown(res);
      expect(state.startCalls).toBe(0);
      expect(state.stopCalls).toBe(0);
    });
  }

  it("stop and halt still reach the engine", async () => {
    await traderEnginePOST(post("/api/trader/engine", { action: "stop" }));
    await traderEnginePOST(post("/api/trader/engine", { action: "halt" }));
    expect(state.stopCalls).toBe(1);
    expect(state.haltCalls).toBe(1);
  });

  it("a manual order answers 503", async () => {
    const res = await brokerOrdersPOST(
      post("/api/broker/orders", { symbol: "AAPL", side: "buy", qty: "1", type: "market", timeInForce: "day" })
    );
    await expectShuttingDown(res);
  });

  it("flatten answers 503", async () => {
    await expectShuttingDown(await traderCommandPOST(post("/api/trader/command", { command: "flatten", symbol: "AAPL" })));
  });
});

describe("routes outside shutdown", () => {
  it("start reaches the engine", async () => {
    const res = await traderEnginePOST(post("/api/trader/engine", { action: "start" }));
    expect(res.status).toBe(200);
    expect(state.startCalls).toBe(1);
  });
});

describe("instrumentation.ts", () => {
  const src = readFileSync(join(__dirname, "..", "..", "src", "instrumentation.ts"), "utf-8");

  it("routes every shutdown signal through runShutdownOnce", () => {
    expect(src).toMatch(/runShutdownOnce\(/);
    expect(src).toMatch(/process\.on\("SIGTERM",\s*\(\)\s*=>\s*handleShutdown\("SIGTERM"\)\)/);
    expect(src).toMatch(/process\.on\("SIGINT",\s*\(\)\s*=>\s*handleShutdown\("SIGINT"\)\)/);
  });
});
