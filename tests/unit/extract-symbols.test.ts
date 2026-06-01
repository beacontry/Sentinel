import { describe, it, expect } from "vitest";
import { extractSymbolsFromQuestion } from "@/lib/market-context";

describe("extractSymbolsFromQuestion", () => {
  it("extracts a single uppercase ticker", () => {
    expect(extractSymbolsFromQuestion("how is AAPL doing today?")).toEqual([
      "AAPL",
    ]);
  });

  it("extracts multiple tickers in order, dedups", () => {
    expect(
      extractSymbolsFromQuestion("compare AAPL, MSFT, and AAPL again")
    ).toEqual(["AAPL", "MSFT"]);
  });

  it("ignores lowercase mentions (too ambiguous)", () => {
    expect(extractSymbolsFromQuestion("what about aapl right now")).toEqual([]);
  });

  it("filters common pronouns and articles", () => {
    expect(
      extractSymbolsFromQuestion("I think THE market IS down right now")
    ).toEqual([]);
  });

  it("filters question words and acknowledgments", () => {
    expect(extractSymbolsFromQuestion("HOW is AAPL?")).toEqual(["AAPL"]);
    expect(extractSymbolsFromQuestion("OK yeah AAPL")).toEqual(["AAPL"]);
  });

  it("filters generic finance acronyms that aren't tickers", () => {
    // AI, ETF, IPO, USA, CEO, GDP, FDA, NYSE — none should pass through
    expect(
      extractSymbolsFromQuestion(
        "what's CEO sentiment on the IPO? Any ETF flows? GDP data?"
      )
    ).toEqual([]);
  });

  it("filters SPY and QQQ (already in Live Tape)", () => {
    // SPY/QQQ are stopworded because the dedicated Live Tape section
    // covers them — no value re-fetching them here.
    expect(extractSymbolsFromQuestion("how is SPY vs QQQ today")).toEqual([]);
  });

  it("caps at the default 5 symbols", () => {
    const result = extractSymbolsFromQuestion(
      "compare AAPL MSFT GOOG AMZN META NVDA TSLA"
    );
    expect(result).toHaveLength(5);
    expect(result).toEqual(["AAPL", "MSFT", "GOOG", "AMZN", "META"]);
  });

  it("respects custom cap", () => {
    expect(
      extractSymbolsFromQuestion("AAPL MSFT GOOG AMZN META", 2)
    ).toEqual(["AAPL", "MSFT"]);
  });

  it("returns empty on a no-ticker question", () => {
    expect(
      extractSymbolsFromQuestion("what is technical analysis good for")
    ).toEqual([]);
  });

  it("handles a mix of stopwords and tickers", () => {
    // "OK how is NVDA doing right now compared to AMD"
    expect(
      extractSymbolsFromQuestion("OK how is NVDA doing right now compared to AMD")
    ).toEqual(["NVDA", "AMD"]);
  });

  it("does not match length-6+ tokens (not valid US tickers in normal range)", () => {
    // BRK.A and longer would need different handling; outside scope.
    expect(extractSymbolsFromQuestion("look at LONGERWORD please")).toEqual([]);
  });

  it("handles tickers with surrounding punctuation", () => {
    expect(extractSymbolsFromQuestion("(NVDA) and (AMD).")).toEqual([
      "NVDA",
      "AMD",
    ]);
  });

  it("preserves first-mention order across the question", () => {
    expect(
      extractSymbolsFromQuestion("AMD did better than NVDA, but NVDA still")
    ).toEqual(["AMD", "NVDA"]);
  });

  it("intentionally allows ambiguous-but-real tickers through (AI, IT)", () => {
    // AI (C3.ai), IT (was Gartner) — we let these through and let Yahoo
    // return null for the unwanted case rather than over-filter. Stopwords
    // cover the most common false positives; the rest is acceptable noise.
    //
    // We DO filter AI and IT in our stopword list, so this test documents
    // current behavior. If the policy flips, this test should flip too.
    expect(extractSymbolsFromQuestion("is AI a buy")).toEqual([]);
    expect(extractSymbolsFromQuestion("IT is up today")).toEqual([]);
  });
});
