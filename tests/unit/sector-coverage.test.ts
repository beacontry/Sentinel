/**
 * Audit #34 — every tradeable-universe symbol must resolve to a real sector.
 * Audit #40 — the EXPOSURE CAP de-pools off-list symbols and ETFs into their
 *             own bucket (the ticker) so unrelated holdings don't spuriously
 *             share the cap. Display grouping (getSymbolSector) keeps "Other"/
 *             "ETF" as meaningful buckets; the cap uses getSectorForExposureCap.
 */

import { describe, it, expect } from "vitest";
import { getSymbolSector, getSectorForExposureCap, getAllSectors } from "@/lib/sectors";
import { SP500_SYMBOLS } from "@/lib/sp500";

describe("sector-map coverage of the tradeable universe (audit #34)", () => {
  it("maps every SP500_SYMBOLS entry to a real GICS sector (not Other)", () => {
    const unmapped = SP500_SYMBOLS.filter((s) => getSymbolSector(s) === "Other");
    expect(unmapped).toEqual([]);
  });

  it("resolves the previously-missing names to their real sectors", () => {
    expect(getSymbolSector("BLK")).toBe("Financials");
    expect(getSymbolSector("WBA")).toBe("Consumer Staples");
    expect(getSymbolSector("MRO")).toBe("Energy");
    expect(getSymbolSector("blk")).toBe("Financials"); // case-insensitive
  });
});

describe("getSymbolSector display grouping is unchanged (audit #40 — cap is separate)", () => {
  it("keeps ETF and Other as display buckets", () => {
    expect(getSymbolSector("SPY")).toBe("ETF");
    expect(getSymbolSector("GLD")).toBe("ETF");
    expect(getSymbolSector("ZZZZ")).toBe("Other");
  });
});

describe("getSectorForExposureCap de-pools for the risk cap (audit #40)", () => {
  it("returns the ticker itself for off-list symbols and ETFs", () => {
    // Off-list / ADR / manual-buy symbols → own bucket, not "Other".
    expect(getSectorForExposureCap("ZZZZ")).toBe("ZZZZ");
    expect(getSectorForExposureCap("nvo")).toBe("NVO"); // case-normalized
    // ETFs no longer pool into one "ETF" bucket — GLD vs XLF vs TLT are
    // unrelated and must not share the sector cap.
    expect(getSectorForExposureCap("GLD")).toBe("GLD");
    expect(getSectorForExposureCap("XLF")).toBe("XLF");
    expect(getSectorForExposureCap("TLT")).toBe("TLT");
    // Two unrelated off-list names get distinct buckets.
    expect(getSectorForExposureCap("AAAA")).not.toBe(getSectorForExposureCap("BBBB"));
  });

  it("still maps real S&P names to their GICS sector (so single-name caps pool correctly)", () => {
    expect(getSectorForExposureCap("AAPL")).toBe("Technology");
    expect(getSectorForExposureCap("JPM")).toBe("Financials");
    // a mapped sector is one of the known display sectors
    expect(new Set(getAllSectors()).has(getSectorForExposureCap("AAPL"))).toBe(true);
  });
});
