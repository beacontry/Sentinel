/**
 * Tests for decidePromotion — the margin-gated promote/keep rule the
 * auto-optimizer cron (/api/cron/auto-optimize) uses to decide whether a
 * freshly-completed GA run replaces the global active preset.
 *
 * Both scores are the candidate-vs-incumbent OUT-OF-SAMPLE excess return
 * computed on the SAME held-out PortfolioData. The margin is a hysteresis band
 * (excess-return percentage points) so noise-level wins don't churn the single
 * global active slot every run.
 */

import { describe, it, expect } from "vitest";
import { decidePromotion } from "@/lib/optimizer";

describe("decidePromotion", () => {
  it("promotes unconditionally when there is no incumbent (first-ever preset)", () => {
    expect(decidePromotion({ candidateOOS: 12, incumbentOOS: null, margin: 2 })).toEqual({
      promote: true,
      reason: "no_incumbent",
    });
  });

  it("promotes when the candidate beats the incumbent by more than the margin", () => {
    // 20 > 15 + 2
    expect(decidePromotion({ candidateOOS: 20, incumbentOOS: 15, margin: 2 })).toEqual({
      promote: true,
      reason: "beat_margin",
    });
  });

  it("keeps the incumbent when the candidate wins but not by the full margin", () => {
    // 16 is better than 15, but not by 2pp
    expect(decidePromotion({ candidateOOS: 16, incumbentOOS: 15, margin: 2 })).toEqual({
      promote: false,
      reason: "below_margin",
    });
  });

  it("treats exactly-at-margin as NOT promoted (strict >, hysteresis)", () => {
    // 17 == 15 + 2 → must strictly exceed
    expect(decidePromotion({ candidateOOS: 17, incumbentOOS: 15, margin: 2 })).toEqual({
      promote: false,
      reason: "below_margin",
    });
  });

  it("keeps the incumbent when the candidate is worse", () => {
    expect(decidePromotion({ candidateOOS: 10, incumbentOOS: 15, margin: 2 }).promote).toBe(false);
  });

  it("never promotes a non-finite candidate score (bad backtest)", () => {
    expect(decidePromotion({ candidateOOS: NaN, incumbentOOS: 15, margin: 2 })).toEqual({
      promote: false,
      reason: "invalid_candidate",
    });
    expect(decidePromotion({ candidateOOS: Infinity, incumbentOOS: 15, margin: 2 }).promote).toBe(false);
  });

  it("treats a non-finite incumbent score as no-incumbent (promote)", () => {
    expect(decidePromotion({ candidateOOS: 5, incumbentOOS: NaN, margin: 2 })).toEqual({
      promote: true,
      reason: "no_incumbent",
    });
  });

  it("handles negative-regime scores (both OOS negative) monotonically", () => {
    // candidate loses less: -5 > -10 + 2 = -8 → promote
    expect(decidePromotion({ candidateOOS: -5, incumbentOOS: -10, margin: 2 }).promote).toBe(true);
    // candidate loses more → keep
    expect(decidePromotion({ candidateOOS: -12, incumbentOOS: -10, margin: 2 }).promote).toBe(false);
  });

  it("clamps a negative margin to 0 (a positive edge still promotes)", () => {
    expect(decidePromotion({ candidateOOS: 15.1, incumbentOOS: 15, margin: -5 }).promote).toBe(true);
    expect(decidePromotion({ candidateOOS: 15, incumbentOOS: 15, margin: -5 }).promote).toBe(false);
  });
});
