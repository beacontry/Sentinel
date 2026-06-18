/**
 * Audit #34 — every tradeable-universe symbol must resolve to a real sector.
 *
 * getSymbolSector() returns "Other" for any unmapped ticker, and the
 * sector-exposure cap sums all same-sector positions — so unmapped S&P 500
 * names (BLK, WBA, MRO, ...) all collapsed into one synthetic "Other" sector,
 * defeating the cap. This guards against future drift: when the S&P 500 rebalance
 * adds a name to SP500_SYMBOLS, it must also be added to the sector map.
 */

import { describe, it, expect } from "vitest";
import { getSymbolSector } from "@/lib/sectors";
import { SP500_SYMBOLS } from "@/lib/sp500";

describe("sector-map coverage of the tradeable universe", () => {
  it("maps every SP500_SYMBOLS entry to a non-Other sector", () => {
    const unmapped = SP500_SYMBOLS.filter((s) => getSymbolSector(s) === "Other");
    expect(unmapped).toEqual([]);
  });

  it("resolves the previously-missing names to their real sectors", () => {
    expect(getSymbolSector("BLK")).toBe("Financials");
    expect(getSymbolSector("WBA")).toBe("Consumer Staples");
    expect(getSymbolSector("MRO")).toBe("Energy");
    // case-insensitive
    expect(getSymbolSector("blk")).toBe("Financials");
  });
});
