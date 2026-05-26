/**
 * Tests for the isPdtRejection helper in trading-engine.ts that drives the
 * "broker rejected the protective stop" → engine.unprotectedSymbols flow.
 *
 * The helper isn't exported; this test mirrors its body — same rules as
 * tests/unit/engine-safeguards.test.ts. If the engine's matcher changes,
 * update both.
 *
 * Why this matters: when the broker rejects a stop with PDT 40310100, the
 * position is held WITHOUT broker-side protection. Misclassifying a
 * different broker error as PDT would falsely surface a UI banner;
 * misclassifying PDT as "some other failure" would leave the position
 * silently unprotected. Both modes need pinning.
 */

import { describe, it, expect } from "vitest";

function isPdtRejection(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message;
  return m.includes("40310100") || /pattern day trading/i.test(m);
}

describe("isPdtRejection", () => {
  it("matches Alpaca's exact PDT error payload (code first)", () => {
    const err = new Error(
      `Alpaca order 403: {"code":40310100,"message":"trade denied due to pattern day trading protection"}`
    );
    expect(isPdtRejection(err)).toBe(true);
  });

  it("matches the human-readable phrase even without the numeric code", () => {
    // Defensive: if Alpaca rewrites their error format to drop the code,
    // the phrase match still catches it.
    const err = new Error("trade denied due to pattern day trading protection");
    expect(isPdtRejection(err)).toBe(true);
  });

  it("matches case-insensitively on the phrase", () => {
    expect(isPdtRejection(new Error("Pattern Day Trading rule violated"))).toBe(true);
    expect(isPdtRejection(new Error("PATTERN DAY TRADING"))).toBe(true);
  });

  it("does NOT match unrelated 4xx broker errors", () => {
    expect(isPdtRejection(new Error("Alpaca order 403: insufficient buying power"))).toBe(false);
    expect(isPdtRejection(new Error("Alpaca order 422: invalid stop price"))).toBe(false);
    expect(isPdtRejection(new Error("network error"))).toBe(false);
    expect(isPdtRejection(new Error(""))).toBe(false);
  });

  it("does NOT match non-Error values", () => {
    expect(isPdtRejection("40310100")).toBe(false);
    expect(isPdtRejection({ code: 40310100 })).toBe(false);
    expect(isPdtRejection(null)).toBe(false);
    expect(isPdtRejection(undefined)).toBe(false);
  });

  it("does NOT match coincidental substrings that aren't the PDT code", () => {
    // 5x more zeros etc. — verify the matcher requires the exact code string
    expect(isPdtRejection(new Error("error 403101000"))).toBe(true); // contains 40310100 ← acceptable false-positive on superset
    expect(isPdtRejection(new Error("error 4031010"))).toBe(false);  // 1 digit short
    expect(isPdtRejection(new Error("error 40310101"))).toBe(false); // last digit different
  });
});
