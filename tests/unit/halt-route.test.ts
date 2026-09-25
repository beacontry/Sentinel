/**
 * POST /api/trader/engine { action: "halt" } reports what the kill switch
 * actually did (WP02, findings #41 and #42): a partial or market-closed halt
 * is ok:false with a 409 naming what closed and what did not, and a full halt
 * names the symbols whose liquidation was submitted rather than claiming
 * "all positions closed".
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  haltResult: {} as Record<string, unknown>,
  audits: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => null,
  requireAuthWithCsrf: async () => ({ userId: "user-1", email: "u@example.com", role: "user" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    writeAudit: vi.fn(async (entry: Record<string, unknown>) => {
      state.audits.push(entry);
    }),
  };
});

vi.mock("@/lib/trading-engine", () => ({
  startEngine: vi.fn(),
  stopEngine: vi.fn(),
  haltEngine: vi.fn(async () => state.haltResult),
  getEngineStatus: () => ({ running: false, halted: true }),
  HALT_BROKER_UNRESOLVED: "BROKER_UNRESOLVED",
  HALT_LIQUIDATION_FAILED: "LIQUIDATION_FAILED",
  HALT_MARKET_CLOSED: "MARKET_CLOSED",
}));

import { POST } from "@/app/api/trader/engine/route";

function haltRequest(): NextRequest {
  return new NextRequest("http://localhost/api/trader/engine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "halt" }),
  });
}

beforeEach(() => {
  state.audits = [];
});

describe("halt route", () => {
  it("a partial halt answers 409 with what closed and what did not", async () => {
    state.haltResult = {
      ok: false,
      code: "LIQUIDATION_FAILED",
      environment: "live",
      closedSymbols: ["MSFT"],
      failedSymbols: ["AAPL"],
      unprotectedSymbols: [],
      error: "Engine halted, but not every position on your live account was closed. Liquidation orders were submitted for: MSFT. Could not place liquidation orders for: AAPL.",
    };
    const res = await POST(haltRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("LIQUIDATION_FAILED");
    expect(body.closedSymbols).toEqual(["MSFT"]);
    expect(body.failedSymbols).toEqual(["AAPL"]);
    expect(body.error).not.toMatch(/all positions closed/i);
    expect(state.audits[0]?.metadata).toMatchObject({ ok: false, closedSymbols: ["MSFT"], failedSymbols: ["AAPL"] });
  });

  it("market closed answers 409 with MARKET_CLOSED", async () => {
    state.haltResult = {
      ok: false,
      code: "MARKET_CLOSED",
      environment: "paper",
      closedSymbols: [],
      failedSymbols: ["AAPL"],
      unprotectedSymbols: [],
      error: "The market is closed.",
    };
    const res = await POST(haltRequest());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("MARKET_CLOSED");
  });

  it("a full halt names the symbols whose liquidation was submitted", async () => {
    state.haltResult = { ok: true, environment: "paper", closedSymbols: ["AAPL", "MSFT"], failedSymbols: [], unprotectedSymbols: [] };
    const res = await POST(haltRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toMatch(/submitted on your paper account for: AAPL, MSFT/);
    expect(body.data.message).not.toMatch(/every open position|all positions closed/i);
    expect(body.data.closedSymbols).toEqual(["AAPL", "MSFT"]);
  });
});
