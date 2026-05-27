/**
 * Integration test for the swap-sell redeployment planner (PR 21a, 2026-05-26).
 *
 * Context: `backtester-swap-sell-equivalent.test.ts` (PR 17) was a unit test
 * that mirrored helper logic. This file tests the actual extracted planner
 * `planSwapSellRedeploy()` end-to-end with realistic scenarios — pin the
 * decision tree that runScan now consumes.
 *
 * The planner is pure (no I/O), so we can drive it with a wide combo of
 * inputs and assert per-candidate decisions. The actual broker call lives
 * in runScan and is covered by the engine-safeguards test path.
 */

import { describe, it, expect } from "vitest";
import {
  planSwapSellRedeploy,
  type SwapSellPlanInputs,
  type SwapSellPlanCandidate,
} from "@/lib/trading-engine";
import { SignalType } from "@/types";

const baseInputs = (overrides: Partial<SwapSellPlanInputs> = {}): SwapSellPlanInputs => ({
  swapMode: "enabled",
  exitsThisScan: 2,
  deferredCandidates: [],
  positionMapSize: 5,
  hardCap: 15, // 1.5x typical maxPositions(10)
  pendingBuySymbols: new Set(),
  cooldowns: new Map(),
  cooldownMs: 150 * 60 * 1000,
  now: 1_700_000_000_000,
  equity: 100_000,
  positionPct: 0.10, // 10% per position → $10k per buy
  maxPositionSize: 1000,
  buyingPower: 50_000,
  currentExposure: 50_000, // 5 positions × $10k each
  maxExposure: 150_000, // 1.5x equity
  ...overrides,
});

const cand = (
  symbol: string,
  confidence: number,
  signal: SignalType = SignalType.STRONG_BUY,
  currentPrice = 100
): SwapSellPlanCandidate => ({ symbol, confidence, signal, currentPrice });

describe("planSwapSellRedeploy", () => {
  it("returns empty plan when swap-sell mode is disabled", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        swapMode: "disabled",
        exitsThisScan: 3,
        deferredCandidates: [cand("AAPL", 0.9)],
      })
    );
    expect(plan.attempts).toEqual([]);
    expect(plan.skips).toEqual([]);
  });

  it("returns empty plan when no exits fired this scan", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 0,
        deferredCandidates: [cand("AAPL", 0.9)],
      })
    );
    expect(plan.attempts).toEqual([]);
  });

  it("returns empty plan when there are no deferred candidates", () => {
    const plan = planSwapSellRedeploy(baseInputs({ exitsThisScan: 3, deferredCandidates: [] }));
    expect(plan.attempts).toEqual([]);
  });

  it("ranks candidates by confidence desc and attempts the top N up to exitsThisScan", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 2,
        deferredCandidates: [
          cand("LOW", 0.55),
          cand("HIGH", 0.95),
          cand("MID", 0.75),
          cand("LOWEST", 0.50),
        ],
      })
    );
    expect(plan.attempts.map((a) => a.symbol)).toEqual(["HIGH", "MID"]);
    expect(plan.attempts).toHaveLength(2);
  });

  it("skips candidates already in pendingBuySymbols (race with another buy)", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 2,
        pendingBuySymbols: new Set(["HIGH"]),
        deferredCandidates: [cand("HIGH", 0.95), cand("MID", 0.75), cand("LOW", 0.55)],
      })
    );
    expect(plan.attempts.map((a) => a.symbol)).toEqual(["MID", "LOW"]);
    expect(plan.skips).toContainEqual({
      symbol: "HIGH",
      decision: "skip",
      reason: "in_pending_buys",
    });
  });

  it("skips candidates currently in cooldown window", () => {
    const now = 1_700_000_000_000;
    const cooldownMs = 150 * 60 * 1000;
    const recentBuyAt = now - cooldownMs + 1; // still in cooldown
    const oldBuyAt = now - cooldownMs - 1; // cooldown expired

    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 3,
        now,
        cooldownMs,
        cooldowns: new Map([
          ["RECENT", recentBuyAt],
          ["OLD", oldBuyAt],
        ]),
        deferredCandidates: [cand("RECENT", 0.95), cand("OLD", 0.90), cand("FRESH", 0.85)],
      })
    );
    expect(plan.attempts.map((a) => a.symbol)).toEqual(["OLD", "FRESH"]);
    expect(plan.skips).toContainEqual({
      symbol: "RECENT",
      decision: "skip",
      reason: "cooldown_active",
    });
  });

  it("skips candidates where qty rounds to 0 (small equity, large price)", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 2,
        equity: 500, // tiny account
        positionPct: 0.10, // $50 per position
        deferredCandidates: [
          cand("AAPL", 0.9, SignalType.STRONG_BUY, 200), // $200/share, $50 budget → qty 0
          cand("PENNY", 0.85, SignalType.STRONG_BUY, 5),  // $5/share, $50 → qty 10, $50 cost OK
        ],
      })
    );
    expect(plan.attempts.map((a) => a.symbol)).toEqual(["PENNY"]);
    expect(plan.skips).toContainEqual({
      symbol: "AAPL",
      decision: "skip",
      reason: "qty_zero",
    });
  });

  it("skips candidates whose notional exceeds buying power", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 2,
        buyingPower: 5_000, // can only afford small notional
        deferredCandidates: [
          cand("BIG", 0.95, SignalType.STRONG_BUY, 100), // floor(100k*0.1/100)=100 shares * $100 = $10k > $5k
        ],
        maxPositionSize: 1000,
      })
    );
    expect(plan.attempts).toEqual([]);
    expect(plan.skips).toContainEqual({
      symbol: "BIG",
      decision: "skip",
      reason: "insufficient_buying_power",
    });
  });

  it("breaks loop on exposure-cap breach (lower-confidence remaining would also breach)", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 3,
        currentExposure: 145_000, // very close to max 150k
        maxExposure: 150_000,
        // Each attempt costs $10k → first attempt makes it 155k > 150k breach
        deferredCandidates: [
          cand("BREACH", 0.95),
          cand("WOULD_FIT", 0.90), // never tried because loop broke on BREACH
        ],
      })
    );
    expect(plan.attempts).toEqual([]);
    expect(plan.skips).toContainEqual({
      symbol: "BREACH",
      decision: "skip",
      reason: "exposure_cap_breach",
    });
    expect(plan.reachedExposureCap).toBe(true);
    // WOULD_FIT must NOT be in skips — loop broke before reaching it
    expect(plan.skips.find((s) => s.symbol === "WOULD_FIT")).toBeUndefined();
  });

  it("breaks loop on hardCap breach (positionMapSize already at hardCap)", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 3,
        positionMapSize: 15,
        hardCap: 15,
        deferredCandidates: [cand("ANY", 0.99)],
      })
    );
    expect(plan.attempts).toEqual([]);
    expect(plan.reachedHardCap).toBe(true);
  });

  it("respects exitsThisScan as the attempt cap even when more candidates pass gates", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 1, // only 1 slot freed
        deferredCandidates: [cand("A", 0.95), cand("B", 0.93), cand("C", 0.91)],
      })
    );
    expect(plan.attempts.map((a) => a.symbol)).toEqual(["A"]);
  });

  it("populates qty + orderCost on each attempt for the caller to consume", () => {
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 1,
        equity: 100_000,
        positionPct: 0.10, // $10k budget
        maxPositionSize: 1000,
        deferredCandidates: [cand("AAPL", 0.9, SignalType.STRONG_BUY, 100)], // floor(10000/100)=100 shares
      })
    );
    expect(plan.attempts).toHaveLength(1);
    expect(plan.attempts[0]).toMatchObject({
      symbol: "AAPL",
      decision: "attempt",
      qty: 100,
      orderCost: 10_000,
    });
  });

  it("end-to-end realistic scenario — multiple gates trigger together", () => {
    const now = 1_700_000_000_000;
    const plan = planSwapSellRedeploy(
      baseInputs({
        exitsThisScan: 3, // 3 slots freed
        positionMapSize: 7,
        hardCap: 15,
        currentExposure: 70_000,
        maxExposure: 150_000,
        pendingBuySymbols: new Set(["PENDING"]),
        cooldowns: new Map([["COOLDOWN", now - 1000]]), // very recent
        cooldownMs: 60_000,
        now,
        deferredCandidates: [
          cand("PENDING", 0.99),        // skip: in pending
          cand("COOLDOWN", 0.95),       // skip: cooldown
          cand("WINNER1", 0.92),        // attempt
          cand("WINNER2", 0.88),        // attempt
          cand("WINNER3", 0.85),        // attempt — would be 3rd, but exitsThisScan=3 so reaches limit
          cand("EXTRA", 0.80),          // never reached
        ],
      })
    );
    expect(plan.attempts.map((a) => a.symbol)).toEqual(["WINNER1", "WINNER2", "WINNER3"]);
    expect(plan.skips.map((s) => s.symbol)).toEqual(["PENDING", "COOLDOWN"]);
    expect(plan.skips.find((s) => s.symbol === "EXTRA")).toBeUndefined();
  });
});
