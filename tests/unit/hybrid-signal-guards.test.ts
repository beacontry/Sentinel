/**
 * Audit #27 + #28 — hybrid layer signal-integrity guards.
 *
 * #27: the AI scoring layer must not fabricate a directional signal from HOLD.
 * #28: the sentiment heuristic must match keywords on word boundaries, not as
 *      substrings, and weight by occurrences.
 */

import { describe, it, expect } from "vitest";
import { isDirectionFlip } from "@/lib/hybrid/ai-scoring-layer";
import { scoreSentimentHeuristic } from "@/lib/hybrid/sentiment-layer";

describe("isDirectionFlip — HOLD is a protected origin (#27)", () => {
  it("blocks HOLD → buyish/sellish (no fabricated directional signal)", () => {
    expect(isDirectionFlip("HOLD", "BUY")).toBe(true);
    expect(isDirectionFlip("HOLD", "STRONG_BUY")).toBe(true);
    expect(isDirectionFlip("HOLD", "SELL")).toBe(true);
    expect(isDirectionFlip("HOLD", "STRONG_SELL")).toBe(true);
  });

  it("still blocks buyish↔sellish flips", () => {
    expect(isDirectionFlip("BUY", "SELL")).toBe(true);
    expect(isDirectionFlip("SELL", "BUY")).toBe(true);
  });

  it("allows down-rank to HOLD and same-direction adjustments", () => {
    expect(isDirectionFlip("BUY", "HOLD")).toBe(false);
    expect(isDirectionFlip("SELL", "HOLD")).toBe(false);
    expect(isDirectionFlip("BUY", "STRONG_BUY")).toBe(false);
    expect(isDirectionFlip("HOLD", "HOLD")).toBe(false);
  });
});

describe("scoreSentimentHeuristic — word-boundary matching (#28)", () => {
  it("does NOT match keywords as substrings of unrelated words", () => {
    // "highlight" contains "high", "against" contains "gain", "below" contains
    // "low", "circuit" contains "cut" — none should register as sentiment.
    const r = scoreSentimentHeuristic(["Conference highlight against the circuit, shares below par"]);
    expect(r.bullish).toBe(0);
    expect(r.bearish).toBe(0);
  });

  it("matches whole-word keywords and weights by occurrence", () => {
    const r = scoreSentimentHeuristic(["Stock surge and rally; another surge today"]);
    expect(r.bullish).toBeGreaterThan(0);
    expect(r.bearish).toBe(0);
  });

  it("scores bearish whole words", () => {
    const r = scoreSentimentHeuristic(["Shares plunge on a guidance cut and downgrade"]);
    expect(r.bearish).toBeGreaterThan(0);
    expect(r.bullish).toBe(0);
  });

  it("handles hyphenated keywords (sell-off) without false partials", () => {
    const r = scoreSentimentHeuristic(["A broad sell-off hit the market"]);
    expect(r.bearish).toBeGreaterThan(0);
  });
});
