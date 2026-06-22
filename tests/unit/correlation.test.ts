/**
 * Audit #45 — Pearson correlation is UNDEFINED (not 0) when either price series
 * is flat (zero variance, e.g. a halted/delisted line). Returning 0 reported a
 * flatlined holding as a perfect diversifier; computeCorrelationMatrix now
 * carries null for the undefined case (null survives JSON; NaN would serialize
 * to "null" and crash `.toFixed` on the client).
 */

import { describe, it, expect } from "vitest";
import { computeCorrelationMatrix } from "@/lib/correlation";
import type { Bar } from "@/types";

function series(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 1_000_000,
  }));
}

describe("computeCorrelationMatrix (audit #45)", () => {
  it("returns null (not 0) for a flat/zero-variance series", () => {
    const { matrix } = computeCorrelationMatrix({
      FLAT: series([50, 50, 50, 50, 50]),
      UP: series([1, 2, 3, 4, 5]),
    });
    // diagonal is self-correlation = 1
    expect(matrix[0][0]).toBe(1);
    expect(matrix[1][1]).toBe(1);
    // the FLAT/UP pair is undefined → null, NOT 0 (the old false "uncorrelated")
    expect(matrix[0][1]).toBeNull();
    expect(matrix[1][0]).toBeNull();
  });

  it("survives JSON serialization as null (not NaN)", () => {
    const { matrix } = computeCorrelationMatrix({
      FLAT: series([10, 10, 10]),
      UP: series([1, 2, 3]),
    });
    const roundTripped = JSON.parse(JSON.stringify({ matrix })).matrix;
    expect(roundTripped[0][1]).toBeNull();
  });

  it("computes a real correlation for varying series", () => {
    const { matrix } = computeCorrelationMatrix({
      A: series([1, 2, 3, 4, 5]),
      B: series([2, 4, 6, 8, 10]), // perfectly correlated
    });
    expect(matrix[0][1]).toBeCloseTo(1, 5);
  });

  it("computes negative correlation for anti-correlated series", () => {
    const { matrix } = computeCorrelationMatrix({
      A: series([1, 2, 3, 4, 5]),
      B: series([5, 4, 3, 2, 1]),
    });
    expect(matrix[0][1]).toBeCloseTo(-1, 5);
  });
});
