/**
 * Tests for stop-sync-scheduler's gating logic.
 *
 * These exercise the REAL pure helper exported from trading-engine.ts —
 * checkStopSyncEligibility — which syncBrokerStopsForUser itself calls. The
 * previous version mirrored the gating in the test body and silently drifted
 * from production: when the halt gate was removed (2026-06-04) and the
 * stale-scan override was added, the mirror kept asserting the OLD behavior
 * and stayed green, providing zero protection. Testing the real helper
 * eliminates that drift class entirely.
 *
 * Why each gate matters:
 *   - misclassifying a healthy engine as "skip" freezes broker stops;
 *   - misclassifying a wedged scan as "skip" leaves stops stale all session
 *     (the 2026-05-26 incident);
 *   - a HALTED engine must STILL run — protective stops must keep refreshing
 *     during the halt window, the exact scenario where a fresh stop matters most.
 */

import { describe, it, expect } from "vitest";
import { checkStopSyncEligibility, STALE_SCAN_OVERRIDE_MS } from "@/lib/trading-engine";

interface MinimalEngine {
  running: boolean;
  halted: boolean;
  scanStartedAt: Date | null;
}

function engine(overrides: Partial<MinimalEngine> = {}): MinimalEngine {
  return { running: true, halted: false, scanStartedAt: null, ...overrides };
}

const NOW = 1_750_000_000_000;

describe("checkStopSyncEligibility — stop-sync gates", () => {
  it("skips with no_engine when the user has never started an engine", () => {
    expect(checkStopSyncEligibility(undefined, false, NOW)).toEqual({
      ran: false,
      reason: "no_engine",
    });
  });

  it("skips with engine_stopped when engine.running=false", () => {
    expect(checkStopSyncEligibility(engine({ running: false }), true, NOW)).toEqual({
      ran: false,
      reason: "engine_stopped",
    });
  });

  it("RUNS for a halted engine — protective stops must keep refreshing while halted", () => {
    // The 2026-06-04 fix: halt does NOT gate this path. A prior contract test
    // asserted the opposite and silently passed against drifted code.
    expect(checkStopSyncEligibility(engine({ halted: true }), true, NOW)).toEqual({
      ran: true,
    });
  });

  it("skips with no_positions when there is nothing to sync", () => {
    expect(checkStopSyncEligibility(engine(), false, NOW)).toEqual({
      ran: false,
      reason: "no_positions",
    });
  });

  it("skips with scan_in_flight when a fresh scan (<10 min) is running", () => {
    const e = engine({ scanStartedAt: new Date(NOW - 60_000) }); // 1 min ago
    expect(checkStopSyncEligibility(e, true, NOW)).toEqual({
      ran: false,
      reason: "scan_in_flight",
    });
  });

  it("RUNS (stale_scan_override) when a scan has been in-flight past the override", () => {
    // The 2026-05-26 incident: a wedged tactical-smart scan that never
    // completes must NOT freeze broker stops forever. Past the override the
    // sync runs anyway. The OLD mirror test asserted this stayed skipped.
    const e = engine({ scanStartedAt: new Date(NOW - 6 * 60 * 60 * 1000) }); // 6h ago
    expect(checkStopSyncEligibility(e, true, NOW)).toEqual({
      ran: true,
      reason: "stale_scan_override",
    });
  });

  it("treats the override threshold as the boundary (>= overrides, < still skips)", () => {
    const atThreshold = engine({ scanStartedAt: new Date(NOW - STALE_SCAN_OVERRIDE_MS) });
    expect(checkStopSyncEligibility(atThreshold, true, NOW)).toEqual({
      ran: true,
      reason: "stale_scan_override",
    });
    const justUnder = engine({ scanStartedAt: new Date(NOW - STALE_SCAN_OVERRIDE_MS + 1) });
    expect(checkStopSyncEligibility(justUnder, true, NOW)).toEqual({
      ran: false,
      reason: "scan_in_flight",
    });
  });

  it("runs when all gates pass", () => {
    expect(checkStopSyncEligibility(engine(), true, NOW)).toEqual({ ran: true });
  });

  it("stopped check fires before the (no-op) halt consideration", () => {
    // An engine that's both stopped AND halted reports stopped — running is the
    // first gate, and halt never gates anyway.
    expect(
      checkStopSyncEligibility(engine({ running: false, halted: true }), true, NOW)
    ).toEqual({ ran: false, reason: "engine_stopped" });
  });
});
