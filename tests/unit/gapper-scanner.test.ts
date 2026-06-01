import { describe, it, expect } from "vitest";
import {
  scanForGappers,
  scoreCandidate,
  DEFAULT_GAPPER_FILTERS,
  type GapperScanInputs,
} from "@/lib/momentum/gapper-scanner";
import type { PolygonTickerSnapshot } from "@/lib/providers/polygon";

// ── Snapshot builder ───────────────────────────────────────────────

function snap(overrides: Partial<PolygonTickerSnapshot> & { symbol: string; price: number; prevDayClose: number }): PolygonTickerSnapshot {
  return {
    dayOpen: overrides.price,
    dayHigh: overrides.price * 1.05,
    dayLow: overrides.price * 0.98,
    dayVolume: 5_000_000,
    prevDayVolume: 1_000_000,
    changePctFromPrevClose:
      (overrides.price - overrides.prevDayClose) / overrides.prevDayClose,
    updatedNs: 0,
    ...overrides,
  };
}

function buildInputs(
  snapshots: Record<string, PolygonTickerSnapshot | null>,
  floats: Record<string, number | null>,
  filters?: GapperScanInputs["filters"]
): GapperScanInputs {
  return {
    universe: Object.keys(snapshots),
    fetchSnapshot: async (s) => snapshots[s] ?? null,
    fetchFloat: async (s) => (s in floats ? floats[s] : null),
    filters,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("scoreCandidate", () => {
  it("monotonically increases with gap", () => {
    expect(scoreCandidate(0.05, 5)).toBeLessThan(scoreCandidate(0.1, 5));
  });

  it("monotonically increases with rvol", () => {
    expect(scoreCandidate(0.1, 5)).toBeLessThan(scoreCandidate(0.1, 50));
  });

  it("dampens rvol via log so a huge volume reading doesn't dominate", () => {
    // 100× RVOL with a tiny gap should not beat a moderate gap with normal RVOL.
    const tinyGapHugeVol = scoreCandidate(0.01, 100);
    const moderateGapNormalVol = scoreCandidate(0.2, 3);
    expect(moderateGapNormalVol).toBeGreaterThan(tinyGapHugeVol);
  });

  it("returns positive scores for valid inputs", () => {
    expect(scoreCandidate(0.05, 1)).toBeGreaterThan(0);
  });
});

describe("scanForGappers", () => {
  it("returns empty result on empty universe", async () => {
    const result = await scanForGappers(buildInputs({}, {}));
    expect(result.candidates).toEqual([]);
    expect(result.examined).toBe(0);
  });

  it("keeps a clean small-cap gapper", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          AAAA: snap({
            symbol: "AAAA",
            price: 5.5,
            prevDayClose: 5.0,
            dayVolume: 8_000_000,
            prevDayVolume: 1_000_000,
          }),
        },
        { AAAA: 10_000_000 }
      )
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].symbol).toBe("AAAA");
    expect(result.candidates[0].gapPct).toBeCloseTo(0.1, 5);
    expect(result.candidates[0].rvol).toBeCloseTo(8, 5);
    expect(result.candidates[0].score).toBeGreaterThan(0);
  });

  it("filters price too high (above $20)", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          BIGG: snap({
            symbol: "BIGG",
            price: 150,
            prevDayClose: 130,
            dayVolume: 100_000_000,
            prevDayVolume: 10_000_000,
          }),
        },
        { BIGG: 5_000_000 }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.price_out_of_range).toBe(1);
  });

  it("filters price too low (sub-$1 OTC)", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          PENNY: snap({
            symbol: "PENNY",
            price: 0.5,
            prevDayClose: 0.3,
            dayVolume: 50_000_000,
            prevDayVolume: 5_000_000,
          }),
        },
        { PENNY: 5_000_000 }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.price_out_of_range).toBe(1);
  });

  it("filters gap below 5%", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          SLOW: snap({
            symbol: "SLOW",
            price: 5.1,
            prevDayClose: 5.0, // 2% gap
            dayVolume: 8_000_000,
            prevDayVolume: 1_000_000,
          }),
        },
        { SLOW: 5_000_000 }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.low_gap).toBe(1);
  });

  it("filters RVOL below threshold", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          QUIET: snap({
            symbol: "QUIET",
            price: 6,
            prevDayClose: 5,
            dayVolume: 100_000, // RVOL = 0.1
            prevDayVolume: 1_000_000,
          }),
        },
        { QUIET: 5_000_000 }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.low_rvol).toBe(1);
  });

  it("filters float too large", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          BIGCO: snap({
            symbol: "BIGCO",
            price: 6,
            prevDayClose: 5,
            dayVolume: 10_000_000,
            prevDayVolume: 1_000_000,
          }),
        },
        { BIGCO: 500_000_000 }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.high_float).toBe(1);
  });

  it("skips symbols with unknown float", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          MYST: snap({
            symbol: "MYST",
            price: 6,
            prevDayClose: 5,
            dayVolume: 10_000_000,
            prevDayVolume: 1_000_000,
          }),
        },
        { MYST: null }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.float_unknown).toBe(1);
  });

  it("skips symbols with no snapshot", async () => {
    const result = await scanForGappers(
      buildInputs(
        { GHOST: null },
        { GHOST: 5_000_000 }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.no_snapshot).toBe(1);
  });

  it("ranks candidates by composite score and caps at limit", async () => {
    const snapshots: Record<string, PolygonTickerSnapshot> = {
      // ~15% gap, RVOL 5
      MEDM: snap({ symbol: "MEDM", price: 5.75, prevDayClose: 5, dayVolume: 5_000_000, prevDayVolume: 1_000_000 }),
      // ~40% gap, RVOL 10
      BEST: snap({ symbol: "BEST", price: 7, prevDayClose: 5, dayVolume: 10_000_000, prevDayVolume: 1_000_000 }),
      // ~8% gap, RVOL 2
      WEAK: snap({ symbol: "WEAK", price: 5.4, prevDayClose: 5, dayVolume: 2_000_000, prevDayVolume: 1_000_000 }),
    };
    const result = await scanForGappers(
      buildInputs(snapshots, { MEDM: 5_000_000, BEST: 5_000_000, WEAK: 5_000_000 }, { limit: 2 })
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].symbol).toBe("BEST");
    expect(result.candidates[1].symbol).toBe("MEDM");
    expect(result.examined).toBe(3);
  });

  it("respects custom filter overrides", async () => {
    // Same payload as 'clean gapper' but custom filters relax price and float.
    const result = await scanForGappers(
      buildInputs(
        {
          MIDC: snap({
            symbol: "MIDC",
            price: 50,
            prevDayClose: 45,
            dayVolume: 5_000_000,
            prevDayVolume: 1_000_000,
          }),
        },
        { MIDC: 100_000_000 },
        { maxPrice: 100, maxFloat: 500_000_000 }
      )
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].symbol).toBe("MIDC");
  });

  it("guards against zero prev-day volume (no divide by zero, treats as 0 RVOL)", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          IPO1: snap({
            symbol: "IPO1",
            price: 6,
            prevDayClose: 5,
            dayVolume: 5_000_000,
            prevDayVolume: 0, // bad data — fresh IPO with no prior day
          }),
        },
        { IPO1: 5_000_000 }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.low_rvol).toBe(1);
  });

  it("guards against invalid prev close", async () => {
    const result = await scanForGappers(
      buildInputs(
        {
          BAD: snap({
            symbol: "BAD",
            price: 5,
            prevDayClose: 0,
            dayVolume: 5_000_000,
            prevDayVolume: 1_000_000,
          }),
        },
        { BAD: 5_000_000 }
      )
    );
    expect(result.candidates).toEqual([]);
    expect(result.skipped.invalid_prev_close).toBe(1);
  });

  it("exposes default filters that match Ross's playbook", () => {
    expect(DEFAULT_GAPPER_FILTERS.minPrice).toBe(1);
    expect(DEFAULT_GAPPER_FILTERS.maxPrice).toBe(20);
    expect(DEFAULT_GAPPER_FILTERS.maxFloat).toBe(20_000_000);
    expect(DEFAULT_GAPPER_FILTERS.minGapPct).toBe(0.05);
  });
});
