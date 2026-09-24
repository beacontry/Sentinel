/**
 * The one P&L formatter (redesign plan, Stage 2): sign, zero, a missing
 * basis, and the U+2212 minus.
 */

import { describe, it, expect } from "vitest";
import { formatPnl, formatSignedPercent, formatSignedUsd, MINUS, percentDirection, pnlDirection } from "@/lib/format-pnl";
import { formatPnl as reExported } from "@/components/display-prefs-provider";

describe("formatPnl", () => {
  it("is the formatter the display-prefs provider exports", () => {
    expect(reExported).toBe(formatPnl);
  });

  it("writes a gain with a plus", () => {
    expect(formatPnl(12.5, undefined, "dollar")).toBe("+$12.50");
  });

  it("writes a loss with the U+2212 minus, not a hyphen", () => {
    expect(formatPnl(-12.5, undefined, "dollar")).toBe(`${MINUS}$12.50`);
    expect(MINUS).toBe("−");
    expect(formatPnl(-12.5, undefined, "dollar")).not.toContain("-");
  });

  it("writes zero, and a value that rounds to zero, with no sign", () => {
    expect(formatPnl(0, undefined, "dollar")).toBe("$0.00");
    expect(formatPnl(-0.004, undefined, "dollar")).toBe("$0.00");
    expect(formatPnl(0.004, 100, "both")).toBe("$0.00 (0.00%)");
  });

  it("falls back to dollars when there is no basis to take a percent of", () => {
    for (const basis of [undefined, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatPnl(-5, basis, "percent")).toBe(`${MINUS}$5.00`);
      expect(formatPnl(-5, basis, "both")).toBe(`${MINUS}$5.00`);
    }
  });

  it("signs both parts of the combined format", () => {
    expect(formatPnl(-12.5, 1000, "both")).toBe(`${MINUS}$12.50 (${MINUS}1.25%)`);
    expect(formatPnl(12.5, 1000, "both")).toBe("+$12.50 (+1.25%)");
  });

  it("writes the percent alone when asked", () => {
    expect(formatPnl(-12.5, 1000, "percent")).toBe(`${MINUS}1.25%`);
  });

  it("prints an unknown value as n/a, never as zero", () => {
    expect(formatPnl(Number.NaN, undefined, "dollar")).toBe("n/a");
    expect(formatSignedUsd(Number.POSITIVE_INFINITY)).toBe("n/a");
    expect(formatSignedPercent(Number.NaN)).toBe("n/a");
  });
});

describe("pnlDirection", () => {
  it("follows the value as displayed, after rounding to cents", () => {
    expect(pnlDirection(0.01)).toBe("gain");
    expect(pnlDirection(-0.01)).toBe("loss");
    expect(pnlDirection(0.004)).toBe("flat");
    expect(pnlDirection(Number.NaN)).toBe("flat");
  });
});

describe("percentDirection", () => {
  it("follows the percent as printed at the given precision", () => {
    expect(percentDirection(0.05, 1)).toBe("gain");
    expect(percentDirection(0.04, 1)).toBe("flat");
    expect(percentDirection(-0.04, 1)).toBe("flat");
    expect(percentDirection(-0.06, 1)).toBe("loss");
    expect(percentDirection(0)).toBe("flat");
  });

  it("has no direction for an unknown percent", () => {
    expect(percentDirection(null)).toBeUndefined();
    expect(percentDirection(undefined)).toBeUndefined();
    expect(percentDirection(Number.NaN)).toBeUndefined();
  });
});
