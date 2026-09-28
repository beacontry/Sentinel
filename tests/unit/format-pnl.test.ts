/**
 * The one P&L formatter (redesign plan, Stage 2): sign, zero, a missing
 * basis, and the U+2212 minus.
 */

import { describe, it, expect } from "vitest";
import { formatPnl, formatPnlParts, formatSignedPercent, formatSignedUsd, formatUsd, MINUS, percentDirection, pnlDirection } from "@/lib/format-pnl";
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

  it("groups dollars in thousands, like the app's other money figures", () => {
    expect(formatSignedUsd(1284.5)).toBe("+$1,284.50");
    expect(formatSignedUsd(-12345.678)).toBe(`${MINUS}$12,345.68`);
    expect(formatSignedUsd(999.999)).toBe("+$1,000.00");
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

describe("formatUsd", () => {
  it("groups a balance to the cent with no sign", () => {
    expect(formatUsd(57737.05)).toBe("$57,737.05");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("keeps the typographic minus for a negative balance", () => {
    expect(formatUsd(-12.5)).toBe(`${MINUS}$12.50`);
  });

  it("does not print a minus for a value that rounds to zero", () => {
    expect(formatUsd(-0.004)).toBe("$0.00");
  });

  it("prints n/a for an unknown", () => {
    expect(formatUsd(Number.NaN)).toBe("n/a");
  });
});

describe("formatPnlParts", () => {
  it("splits the both format into the signed figure and the percent", () => {
    expect(formatPnlParts(-12.5, 1000, "both")).toEqual({ amount: `${MINUS}$12.50`, percent: `(${MINUS}1.25%)` });
  });

  it("is one token for a single format or without a basis", () => {
    expect(formatPnlParts(12.5, 1000, "dollar")).toEqual({ amount: "+$12.50" });
    expect(formatPnlParts(12.5, 1000, "percent")).toEqual({ amount: "+1.25%" });
    expect(formatPnlParts(12.5, undefined, "both")).toEqual({ amount: "+$12.50" });
  });

  it("joins back to exactly what formatPnl prints", () => {
    for (const [v, b] of [[123456.7, 1234567], [-0.004, 10], [5, 0]] as const) {
      const { amount, percent } = formatPnlParts(v, b, "both");
      expect(percent ? `${amount} ${percent}` : amount).toBe(formatPnl(v, b, "both"));
    }
  });
});
