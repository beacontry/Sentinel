/**
 * Tests for net realized-exit accounting (audit #2 / #20).
 *
 * #20: engine.dailyLoss must accumulate NET realized P&L, not the old gross
 *      losing-trade sum (which false-halted net-profitable, high-turnover days).
 * #2:  every discretionary exit must advance the consecutive-loss streak; these
 *      helpers are the shared path now used by runScan, runExitCheck, and the
 *      tactical-smart swap-sell.
 *
 * Exercised below the halt threshold so tripSafeguardHalt (which fires audit /
 * DB writes) is never invoked — the threshold-trip path is covered by
 * engine-safeguards.test.ts.
 */

import { describe, it, expect } from "vitest";
import { accrueRealizedPnl, recordRealizedExit } from "@/lib/trading-engine";

// Minimal stand-ins; these helpers only touch dailyLoss / consecutiveLosses
// below threshold.
function eng(over: Record<string, unknown> = {}) {
  return { dailyLoss: 0, consecutiveLosses: 0, halted: false, ...over } as never;
}
const riskLimits = { maxConsecutiveLosses: 5 } as never;

describe("realized-exit accounting (audit #2/#20)", () => {
  it("accrueRealizedPnl accumulates NET P&L, not gross losses", () => {
    const e = eng() as unknown as { dailyLoss: number };
    accrueRealizedPnl(e as never, 500);
    accrueRealizedPnl(e as never, -200);
    accrueRealizedPnl(e as never, -100);
    // Net: 500 - 200 - 100 = +200. The old gross-only bug would report -300.
    expect(e.dailyLoss).toBe(200);
  });

  it("recordRealizedExit accrues net AND advances the consecutive-loss streak", () => {
    const e = eng() as unknown as { dailyLoss: number; consecutiveLosses: number; halted: boolean };
    recordRealizedExit(e as never, -150, riskLimits); // loss
    expect(e.dailyLoss).toBe(-150);
    expect(e.consecutiveLosses).toBe(1);

    recordRealizedExit(e as never, -50, riskLimits); // loss
    expect(e.consecutiveLosses).toBe(2);
    expect(e.dailyLoss).toBe(-200);

    recordRealizedExit(e as never, 400, riskLimits); // win: resets streak, accrues net
    expect(e.consecutiveLosses).toBe(0);
    expect(e.dailyLoss).toBe(200); // -200 + 400
    expect(e.halted).toBe(false); // never reached the threshold
  });
});
