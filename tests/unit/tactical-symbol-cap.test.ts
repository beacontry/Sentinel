/**
 * Tests for selectExternalSymbolsForTactical — the helper that caps the
 * screener-fed symbol set so runTacticalSmartScan can't iterate hundreds
 * of symbols and run past its time budget.
 *
 * The helper isn't exported (it lives inside trading-engine.ts alongside
 * runTacticalSmartScan). Mirroring the body here following the same
 * pattern as tests/unit/engine-safeguards.test.ts.
 *
 * Context: 2026-05-26 incident — tactical-smart scans iterated ~500
 * screener-fed symbols × ~1s each (Finnhub rate limit), exceeding the
 * 15-min scan cadence. Scans hung indefinitely, never reached
 * syncBrokerStops. The cap (default 50) keeps the loop bounded.
 */

import { describe, it, expect } from "vitest";

interface ExternalSignal {
  symbol: string;
  signal: string;
  confidence: number;
  price: number;
  source: string;
  receivedAt: number;
}

const TACTICAL_MAX_EXTERNAL_SYMBOLS = 50;

function selectExternalSymbolsForTactical(
  externalSignals: readonly ExternalSignal[],
  universe: readonly string[],
  maxCount: number = TACTICAL_MAX_EXTERNAL_SYMBOLS
): string[] {
  const universeSet = new Set(universe);
  return externalSignals
    .filter((s) => (s.signal === "BUY" || s.signal === "STRONG_BUY") && !universeSet.has(s.symbol))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxCount)
    .map((s) => s.symbol);
}

function makeSignal(symbol: string, signal: string, confidence: number): ExternalSignal {
  return { symbol, signal, confidence, price: 100, source: "screener", receivedAt: Date.now() };
}

describe("selectExternalSymbolsForTactical", () => {
  it("returns empty when there are no signals", () => {
    expect(selectExternalSymbolsForTactical([], ["AAPL"])).toEqual([]);
  });

  it("filters out non-BUY signals (HOLD, SELL, etc.)", () => {
    const signals = [
      makeSignal("AAA", "STRONG_BUY", 0.9),
      makeSignal("BBB", "HOLD", 0.95),
      makeSignal("CCC", "SELL", 0.92),
      makeSignal("DDD", "STRONG_SELL", 0.99),
      makeSignal("EEE", "BUY", 0.8),
    ];
    const result = selectExternalSymbolsForTactical(signals, []);
    expect(result).toEqual(["AAA", "EEE"]);
  });

  it("filters out symbols already in SCAN_UNIVERSE", () => {
    const signals = [
      makeSignal("AAPL", "STRONG_BUY", 0.99),
      makeSignal("NVDA", "BUY", 0.9),
      makeSignal("UNKNOWN", "STRONG_BUY", 0.85),
    ];
    const universe = ["AAPL", "MSFT", "NVDA"];
    const result = selectExternalSymbolsForTactical(signals, universe);
    expect(result).toEqual(["UNKNOWN"]);
  });

  it("sorts by confidence descending", () => {
    const signals = [
      makeSignal("LOW", "BUY", 0.6),
      makeSignal("HIGH", "STRONG_BUY", 0.95),
      makeSignal("MID", "BUY", 0.8),
    ];
    const result = selectExternalSymbolsForTactical(signals, []);
    expect(result).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("respects the maxCount cap and takes the top N by confidence", () => {
    const signals = Array.from({ length: 100 }, (_, i) =>
      makeSignal(`SYM${i}`, "STRONG_BUY", i / 100) // SYM99=0.99 (highest), SYM0=0.00 (lowest)
    );
    const result = selectExternalSymbolsForTactical(signals, [], 5);
    expect(result).toEqual(["SYM99", "SYM98", "SYM97", "SYM96", "SYM95"]);
  });

  it("default cap is 50", () => {
    const signals = Array.from({ length: 200 }, (_, i) =>
      makeSignal(`SYM${i}`, "BUY", Math.random())
    );
    const result = selectExternalSymbolsForTactical(signals, []);
    expect(result).toHaveLength(50);
  });

  it("returns fewer than maxCount when input is smaller", () => {
    const signals = [makeSignal("A", "BUY", 0.5), makeSignal("B", "BUY", 0.6)];
    const result = selectExternalSymbolsForTactical(signals, [], 50);
    expect(result).toEqual(["B", "A"]);
  });

  it("regression check — the 2026-05-26 scan-hang scenario", () => {
    // 503 screener-fed BUY/STRONG_BUY signals (the actual production count
    // that hung scans). With the cap, we should evaluate 50 externals plus
    // the ~30-symbol hardcoded universe = ~80 symbols total per scan. At
    // ~1s/symbol Finnhub-rate-limited, that's ~80s — well under the 8-min
    // TACTICAL_SCAN_SYMBOL_BUDGET_MS and the 15-min cadence.
    const signals = Array.from({ length: 503 }, (_, i) =>
      makeSignal(`PROD${i}`, i % 2 === 0 ? "BUY" : "STRONG_BUY", Math.random())
    );
    const universe = Array.from({ length: 30 }, (_, i) => `UNI${i}`);
    const result = selectExternalSymbolsForTactical(signals, universe);
    expect(result.length).toBe(50);
    // None of the universe symbols leak into the external set
    expect(result.every((s) => !universe.includes(s))).toBe(true);
  });
});
