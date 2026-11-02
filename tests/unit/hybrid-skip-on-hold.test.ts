/**
 * skipLayersOnHold (2026-11-01) — the engine's scan skips every non-technical
 * layer when the technical signal is HOLD, because no layer can lift a HOLD
 * and the layers were the whole Finnhub budget (~470 calls per 15-min scan on
 * a 60/min limit). The screener and analyze routes leave the option unset and
 * keep running the layers on HOLDs for display.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { analyzeBarsMock, sentimentMock, optionsMock, analystMock, aiMock } = vi.hoisted(() => ({
  analyzeBarsMock: vi.fn(),
  sentimentMock: vi.fn(async () => null),
  optionsMock: vi.fn(async () => null),
  analystMock: vi.fn(async () => null),
  aiMock: vi.fn(async () => null),
}));
vi.mock("@/lib/indicators/analyzer", () => ({
  analyzeBars: (...args: unknown[]) => analyzeBarsMock(...args),
}));
vi.mock("@/lib/hybrid/sentiment-layer", () => ({ applySentimentLayer: sentimentMock }));
vi.mock("@/lib/hybrid/options-layer", () => ({ applyOptionsFlowLayer: optionsMock }));
vi.mock("@/lib/hybrid/analyst-layer", () => ({ applyAnalystLayer: analystMock }));
vi.mock("@/lib/hybrid/ai-scoring-layer", () => ({ applyAiScoringLayer: aiMock }));

import { analyzeHybrid } from "@/lib/hybrid/pipeline";

function technical(signal: string, confidence = 0.6) {
  return {
    symbol: "TEST",
    signal,
    confidence,
    price: 100,
    volume: 1_000_000,
    indicators: {},
    series: {},
    bars: [],
    reasons: ["technical reason"],
    plainEnglish: "",
    timestamp: new Date().toISOString(),
    volumeRatio: 1,
  };
}

const ALL_ON = {
  enableSentiment: true,
  enableOptionsFlow: true,
  enableAnalyst: true,
  enableAiScoring: true,
};

beforeEach(() => {
  analyzeBarsMock.mockReset();
  sentimentMock.mockClear();
  optionsMock.mockClear();
  analystMock.mockClear();
  aiMock.mockClear();
});

describe("analyzeHybrid skipLayersOnHold", () => {
  it("skips every layer on a technical HOLD when the option is set", async () => {
    analyzeBarsMock.mockReturnValue(technical("HOLD"));
    const r = await analyzeHybrid("TEST", [], { ...ALL_ON, skipLayersOnHold: true });
    expect(sentimentMock).not.toHaveBeenCalled();
    expect(optionsMock).not.toHaveBeenCalled();
    expect(analystMock).not.toHaveBeenCalled();
    expect(aiMock).not.toHaveBeenCalled();
    expect(r.signal).toBe("HOLD");
    expect(r.hybrid?.layers).toEqual(["technical"]);
  });

  it("still runs the layers on a technical BUY with the option set", async () => {
    analyzeBarsMock.mockReturnValue(technical("BUY"));
    await analyzeHybrid("TEST", [], { ...ALL_ON, skipLayersOnHold: true });
    expect(sentimentMock).toHaveBeenCalledTimes(1);
    expect(optionsMock).toHaveBeenCalledTimes(1);
    expect(analystMock).toHaveBeenCalledTimes(1);
    expect(aiMock).toHaveBeenCalledTimes(1);
  });

  it("still runs the layers on a technical SELL with the option set", async () => {
    analyzeBarsMock.mockReturnValue(technical("SELL"));
    await analyzeHybrid("TEST", [], { ...ALL_ON, skipLayersOnHold: true });
    expect(sentimentMock).toHaveBeenCalledTimes(1);
    expect(analystMock).toHaveBeenCalledTimes(1);
  });

  it("runs the layers on a HOLD when the option is unset (screener / analyze routes)", async () => {
    analyzeBarsMock.mockReturnValue(technical("HOLD"));
    await analyzeHybrid("TEST", [], ALL_ON);
    expect(sentimentMock).toHaveBeenCalledTimes(1);
    expect(optionsMock).toHaveBeenCalledTimes(1);
    expect(analystMock).toHaveBeenCalledTimes(1);
    expect(aiMock).toHaveBeenCalledTimes(1);
  });

  it("a HOLD with layers run is still a HOLD — the skip changes nothing a trading loop acts on", async () => {
    analyzeBarsMock.mockReturnValue(technical("HOLD", 0.3));
    sentimentMock.mockResolvedValueOnce({ adjustment: 0.5, reasons: ["very bullish news"] } as never);
    const r = await analyzeHybrid("TEST", [], { enableSentiment: true, enableOptionsFlow: false, enableAnalyst: false, enableAiScoring: false });
    expect(r.signal).toBe("HOLD");
    expect(r.confidence).toBeCloseTo(0.8, 5);
  });
});
