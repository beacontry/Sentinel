/**
 * Tests for the backtester's swap-sell-equivalent behavior added in PR 17.
 *
 * Context: runScan's "post-loop swap-sell redeploy" closes a gap where its
 * symbol-iteration order interleaves exits and entries, causing STRONG_BUY
 * candidates to hit the position cap before the same-scan exit that would
 * have freed the slot. The optimizer's portfolioBacktest does NOT have this
 * problem because exits run at the top of each bar and entries run at the
 * bottom — positions.length naturally reflects same-bar exits before slot
 * allocation. PR 17 added:
 *   1. STRONG_BUY hardCap overshoot (1.5× BACKTEST_MAX_POSITIONS), mirroring
 *      runScan's hardCap. Without parity, GA underestimates how many
 *      STRONG_BUYs the live engine carries in strong windows.
 *   2. Confidence-based ranking within signal type — mirrors swap-sell's
 *      "deferred candidates sorted by confidence."
 *
 * These tests pin the per-cap-by-signal-type logic and the post-PR-17
 * candidate-ranking shape. portfolioBacktest itself isn't exported (it's
 * an internal of the optimizer); we mirror the relevant helper logic in
 * the same shape as engine-safeguards.test.ts.
 */

import { describe, it, expect } from "vitest";

interface Candidate {
  symbol: string;
  signal: "BUY" | "STRONG_BUY";
  confidence: number;
}

const BACKTEST_MAX_POSITIONS = 10;
const BACKTEST_HARD_CAP_STRONG_BUY = Math.floor(BACKTEST_MAX_POSITIONS * 1.5); // 15

function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    const sigOrder = (a.signal === "STRONG_BUY" ? 0 : 1) - (b.signal === "STRONG_BUY" ? 0 : 1);
    if (sigOrder !== 0) return sigOrder;
    return b.confidence - a.confidence;
  });
}

/**
 * Simulates the entry slot allocation. Returns the symbols that would be
 * bought given the current positions count and a candidate list.
 */
function allocateSlots(positionsCount: number, candidates: Candidate[]): string[] {
  const ranked = rankCandidates(candidates);
  const bought: string[] = [];
  let count = positionsCount;
  for (const cand of ranked) {
    const cap = cand.signal === "STRONG_BUY" ? BACKTEST_HARD_CAP_STRONG_BUY : BACKTEST_MAX_POSITIONS;
    if (count >= cap) continue;
    bought.push(cand.symbol);
    count++;
  }
  return bought;
}

describe("portfolioBacktest entry slot allocation (PR 17 swap-sell-equivalent)", () => {
  it("STRONG_BUYs fill the hardCap (15) and BUYs fill only the regular cap (10)", () => {
    // 7 STRONG_BUYs + 7 BUYs from a starting position of 5
    const cands: Candidate[] = [
      ...Array.from({ length: 7 }, (_, i) => ({ symbol: `S${i}`, signal: "STRONG_BUY" as const, confidence: 0.9 })),
      ...Array.from({ length: 7 }, (_, i) => ({ symbol: `B${i}`, signal: "BUY" as const, confidence: 0.6 })),
    ];
    const bought = allocateSlots(5, cands);
    // 5 starting + 7 STRONG_BUYs = 12, still under hardCap 15 → all 7 STRONG_BUYs in
    // 12 + BUYs up to MAX_POSITIONS 10 → 0 BUYs (count is already 12, > 10)
    expect(bought.length).toBe(7);
    expect(bought.every((s) => s.startsWith("S"))).toBe(true);
  });

  it("STRONG_BUYs ranked by confidence desc within signal type", () => {
    const cands: Candidate[] = [
      { symbol: "LOW", signal: "STRONG_BUY", confidence: 0.6 },
      { symbol: "HIGH", signal: "STRONG_BUY", confidence: 0.95 },
      { symbol: "MID", signal: "STRONG_BUY", confidence: 0.8 },
    ];
    const bought = allocateSlots(13, cands); // 13 + 2 hardCap room = take 2
    expect(bought).toEqual(["HIGH", "MID"]);
  });

  it("STRONG_BUYs always rank before BUYs regardless of confidence", () => {
    const cands: Candidate[] = [
      { symbol: "BUY_HIGH", signal: "BUY", confidence: 0.99 },
      { symbol: "SB_LOW", signal: "STRONG_BUY", confidence: 0.51 },
    ];
    const ranked = rankCandidates(cands);
    expect(ranked[0].symbol).toBe("SB_LOW"); // STRONG_BUY beats BUY on rank
    expect(ranked[1].symbol).toBe("BUY_HIGH");
  });

  it("BUYs don't get the hardCap overshoot — capped at MAX_POSITIONS even if STRONG_BUYs absent", () => {
    const cands: Candidate[] = Array.from({ length: 8 }, (_, i) => ({
      symbol: `B${i}`,
      signal: "BUY" as const,
      confidence: 0.7,
    }));
    const bought = allocateSlots(7, cands); // 7 + 3 to MAX = 3 BUYs
    expect(bought.length).toBe(3);
  });

  it("STRONG_BUY hardCap of 15 = 1.5× MAX_POSITIONS (sanity)", () => {
    expect(BACKTEST_HARD_CAP_STRONG_BUY).toBe(15);
    expect(BACKTEST_HARD_CAP_STRONG_BUY).toBe(Math.floor(BACKTEST_MAX_POSITIONS * 1.5));
  });

  it("post-exit redeploy is implicit — entries see positionCount AFTER exits", () => {
    // Backtester runs exits at top of bar, entries at bottom. So a bar
    // where positionCount started at 10 (full) but one exit fired drops
    // to 9 by entry time → the next-best STRONG_BUY can enter.
    // We model this by simulating "post-exit positionCount" directly.
    const positionsCountAfterExit = 9; // 10 → 9 after one exit
    const cands: Candidate[] = [
      { symbol: "BEST", signal: "STRONG_BUY", confidence: 0.95 },
      { symbol: "SECOND", signal: "STRONG_BUY", confidence: 0.85 },
    ];
    const bought = allocateSlots(positionsCountAfterExit, cands);
    // 9 → +1 STRONG_BUY = 10 (under hardCap 15)
    // → +1 more STRONG_BUY = 11 (still under hardCap)
    expect(bought).toEqual(["BEST", "SECOND"]);
  });

  it("regression — runScan's 'swap-sell defers cap-blocked' problem doesn't exist here", () => {
    // In runScan's symbol-loop, if a STRONG_BUY for symbol Y came BEFORE
    // the exit for symbol X in iteration order, Y would have hit the cap.
    // The backtester doesn't iterate symbols-then-exits — it does exits
    // ALL FIRST, then ranks ALL candidates by signal+confidence. So a
    // STRONG_BUY for any symbol gets evaluated against the post-exit
    // positionCount, not the pre-exit count. Functionally equivalent
    // to swap-sell's "defer + redeploy" pattern, structurally simpler.
    const startCount = 9;
    const cands: Candidate[] = [
      // Order doesn't matter — ranking sorts them regardless
      { symbol: "Y_STRONG", signal: "STRONG_BUY", confidence: 0.90 },
      { symbol: "X_BUY", signal: "BUY", confidence: 0.95 },
    ];
    const bought = allocateSlots(startCount, cands);
    // STRONG_BUY first → Y_STRONG enters (count=10, under hardCap)
    // X_BUY rank 2 → would need count<MAX_POSITIONS=10, count is 10 → skip
    expect(bought).toEqual(["Y_STRONG"]);
  });
});
