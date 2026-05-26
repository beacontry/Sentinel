/**
 * Tests for stop-sync-scheduler's gating logic.
 *
 * The scheduler itself is a thin loop over getAllEngineSnapshots that
 * delegates the actual sync to syncBrokerStopsForUser. The interesting
 * behavior is the gating inside syncBrokerStopsForUser — which engines
 * get skipped and why — because misclassifying a healthy engine as
 * "skip" means stops freeze; misclassifying an unhealthy engine as
 * "run" means we race with the in-scan sync at the scan tail.
 *
 * Following the pattern of tests/unit/engine-safeguards.test.ts:
 * mirror the helper's body so the contract is pinned without booting
 * the full engine module.
 */

import { describe, it, expect } from "vitest";

interface MinimalEngine {
  running: boolean;
  halted: boolean;
  scanStartedAt: Date | null;
}

interface FakeGlobalState {
  engines: Map<string, MinimalEngine>;
  positionMaps: Map<string, Map<string, unknown>>;
}

// Mirror of syncBrokerStopsForUser's gating from src/lib/trading-engine.ts.
// If the engine's checks change, update both. This is the contract test.
function checkSyncEligibility(
  state: FakeGlobalState,
  userId: string
): { ran: boolean; reason?: string } {
  const engine = state.engines.get(userId);
  if (!engine) return { ran: false, reason: "no_engine" };
  if (!engine.running) return { ran: false, reason: "engine_stopped" };
  if (engine.halted) return { ran: false, reason: "engine_halted" };
  const positionMap = state.positionMaps.get(userId);
  if (!positionMap || positionMap.size === 0) {
    return { ran: false, reason: "no_positions" };
  }
  if (engine.scanStartedAt) {
    return { ran: false, reason: "scan_in_flight" };
  }
  return { ran: true };
}

function newState(): FakeGlobalState {
  return { engines: new Map(), positionMaps: new Map() };
}

function addEngine(
  state: FakeGlobalState,
  userId: string,
  overrides: Partial<MinimalEngine> = {},
  positions: string[] = []
): void {
  state.engines.set(userId, {
    running: true,
    halted: false,
    scanStartedAt: null,
    ...overrides,
  });
  const pm = new Map<string, unknown>();
  for (const sym of positions) pm.set(sym, {});
  state.positionMaps.set(userId, pm);
}

describe("syncBrokerStopsForUser — eligibility gates", () => {
  it("skips with no_engine when the user has never started an engine", () => {
    const s = newState();
    expect(checkSyncEligibility(s, "ghost-user")).toEqual({ ran: false, reason: "no_engine" });
  });

  it("skips with engine_stopped when engine.running=false", () => {
    const s = newState();
    addEngine(s, "u1", { running: false }, ["AAPL"]);
    expect(checkSyncEligibility(s, "u1")).toEqual({ ran: false, reason: "engine_stopped" });
  });

  it("skips with engine_halted when engine.halted=true", () => {
    const s = newState();
    addEngine(s, "u1", { halted: true }, ["AAPL"]);
    expect(checkSyncEligibility(s, "u1")).toEqual({ ran: false, reason: "engine_halted" });
  });

  it("skips with no_positions when positionMap is empty", () => {
    const s = newState();
    addEngine(s, "u1", {}, []);
    expect(checkSyncEligibility(s, "u1")).toEqual({ ran: false, reason: "no_positions" });
  });

  it("skips with no_positions when positionMap is missing entirely", () => {
    const s = newState();
    s.engines.set("u1", { running: true, halted: false, scanStartedAt: null });
    // intentionally no positionMaps entry
    expect(checkSyncEligibility(s, "u1")).toEqual({ ran: false, reason: "no_positions" });
  });

  it("skips with scan_in_flight when a scan is currently running", () => {
    const s = newState();
    addEngine(s, "u1", { scanStartedAt: new Date() }, ["AAPL"]);
    expect(checkSyncEligibility(s, "u1")).toEqual({ ran: false, reason: "scan_in_flight" });
  });

  it("runs when all gates pass", () => {
    const s = newState();
    addEngine(s, "u1", {}, ["AAPL", "MSFT"]);
    expect(checkSyncEligibility(s, "u1")).toEqual({ ran: true });
  });

  it("evaluates each engine independently — one user's skip doesn't affect another", () => {
    const s = newState();
    addEngine(s, "healthy", {}, ["AAPL"]);
    addEngine(s, "halted", { halted: true }, ["MSFT"]);
    addEngine(s, "scanning", { scanStartedAt: new Date() }, ["GOOGL"]);

    expect(checkSyncEligibility(s, "healthy")).toEqual({ ran: true });
    expect(checkSyncEligibility(s, "halted")).toEqual({ ran: false, reason: "engine_halted" });
    expect(checkSyncEligibility(s, "scanning")).toEqual({ ran: false, reason: "scan_in_flight" });
  });

  it("gates apply in the documented order — stopped check fires before halted", () => {
    // An engine that's both stopped AND halted reports stopped — order matters
    // because a stopped engine never reaches a halt and reporting "halted"
    // would mislead a future debugger trying to grep for "why is sync skipping".
    const s = newState();
    addEngine(s, "u1", { running: false, halted: true }, ["AAPL"]);
    expect(checkSyncEligibility(s, "u1")).toEqual({ ran: false, reason: "engine_stopped" });
  });

  it("a hung scan (scanStartedAt set for hours) still reports scan_in_flight", () => {
    // The incident this whole PR addresses: tactical-smart scan flagged
    // in-flight, never completes. Scheduler MUST skip — not race in.
    // The 10-min override in the engine's tick logic clears scanStartedAt
    // eventually, after which the next scheduler tick will fire.
    const s = newState();
    addEngine(
      s,
      "u1",
      { scanStartedAt: new Date(Date.now() - 6 * 60 * 60 * 1000) }, // 6 hours ago
      ["AAPL"]
    );
    expect(checkSyncEligibility(s, "u1")).toEqual({ ran: false, reason: "scan_in_flight" });
  });
});
