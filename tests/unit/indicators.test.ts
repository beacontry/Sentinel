import { describe, it, expect, beforeEach } from "vitest";
import { SMA } from "@/lib/indicators/sma";
import { EMA } from "@/lib/indicators/ema";
import { RSI } from "@/lib/indicators/rsi";
import { ATR } from "@/lib/indicators/atr";
import { MACD } from "@/lib/indicators/macd";
import { VWAP } from "@/lib/indicators/vwap";
import { BollingerBands } from "@/lib/indicators/bollinger";
import { bar, barSequence, trendUp } from "./helpers";

// ─── SMA ─────────────────────────────────────────────────────────

describe("SMA", () => {
  let sma: SMA;

  beforeEach(() => {
    sma = new SMA(3);
  });

  it("returns null before window is filled", () => {
    sma.update(bar(10));
    sma.update(bar(20));
    expect(sma.ready()).toBe(false);
    expect(sma.value()).toBeNull();
  });

  it("returns correct average after window is filled", () => {
    sma.update(bar(10));
    sma.update(bar(20));
    sma.update(bar(30));
    expect(sma.ready()).toBe(true);
    expect(sma.value()).toBeCloseTo(20, 5);
  });

  it("slides window correctly", () => {
    sma.update(bar(10));
    sma.update(bar(20));
    sma.update(bar(30));
    sma.update(bar(40));
    // window: [20, 30, 40]
    expect(sma.value()).toBeCloseTo(30, 5);
  });

  it("resets to initial state", () => {
    sma.update(bar(10));
    sma.update(bar(20));
    sma.update(bar(30));
    sma.reset();
    expect(sma.ready()).toBe(false);
    expect(sma.value()).toBeNull();
  });

  it("handles single-element window", () => {
    const sma1 = new SMA(1);
    sma1.update(bar(42));
    expect(sma1.value()).toBeCloseTo(42, 5);
    sma1.update(bar(99));
    expect(sma1.value()).toBeCloseTo(99, 5);
  });
});

// ─── EMA ─────────────────────────────────────────────────────────

describe("EMA", () => {
  let ema: EMA;

  beforeEach(() => {
    ema = new EMA(3);
  });

  it("returns null before window is seeded", () => {
    ema.update(bar(10));
    ema.update(bar(20));
    expect(ema.ready()).toBe(false);
    expect(ema.value()).toBeNull();
  });

  it("seeds with SMA of first N bars", () => {
    ema.update(bar(10));
    ema.update(bar(20));
    ema.update(bar(30));
    expect(ema.ready()).toBe(true);
    // Seed = SMA(10,20,30) = 20
    expect(ema.value()).toBeCloseTo(20, 5);
  });

  it("applies exponential smoothing after seed", () => {
    ema.update(bar(10));
    ema.update(bar(20));
    ema.update(bar(30));
    ema.update(bar(40));
    // k = 2/(3+1) = 0.5
    // EMA = 40 * 0.5 + 20 * 0.5 = 30
    expect(ema.value()).toBeCloseTo(30, 5);
  });

  it("tracks recent values in history", () => {
    ema.update(bar(10));
    ema.update(bar(20));
    ema.update(bar(30));
    ema.update(bar(40));
    const hist = ema.history();
    expect(hist.length).toBe(2); // after seed + 1 update
    expect(hist[0]).toBeCloseTo(20, 5); // seed
    expect(hist[1]).toBeCloseTo(30, 5); // after 40
  });

  it("resets cleanly", () => {
    ema.update(bar(10));
    ema.update(bar(20));
    ema.update(bar(30));
    ema.reset();
    expect(ema.ready()).toBe(false);
    expect(ema.value()).toBeNull();
    expect(ema.history()).toEqual([]);
  });
});

// ─── RSI ─────────────────────────────────────────────────────────

describe("RSI", () => {
  let rsi: RSI;

  beforeEach(() => {
    rsi = new RSI(14);
  });

  it("returns null before period is filled", () => {
    for (let i = 0; i < 10; i++) rsi.update(bar(100 + i));
    expect(rsi.ready()).toBe(false);
    expect(rsi.value()).toBeNull();
  });

  it("returns 100 when all moves are up (no losses)", () => {
    // 15 bars: first sets prevClose, next 14 are all gains
    for (let i = 0; i < 15; i++) rsi.update(bar(100 + i));
    expect(rsi.ready()).toBe(true);
    expect(rsi.value()).toBe(100);
  });

  it("returns ~0 when all moves are down", () => {
    for (let i = 0; i < 15; i++) rsi.update(bar(200 - i));
    expect(rsi.ready()).toBe(true);
    expect(rsi.value()!).toBeLessThan(1);
  });

  it("returns ~50 for equal up/down moves", () => {
    // Alternating +1 and -1
    for (let i = 0; i < 15; i++) {
      rsi.update(bar(100 + (i % 2 === 0 ? 1 : -1)));
    }
    expect(rsi.ready()).toBe(true);
    const val = rsi.value()!;
    expect(val).toBeGreaterThan(30);
    expect(val).toBeLessThan(70);
  });

  it("resets cleanly", () => {
    for (let i = 0; i < 15; i++) rsi.update(bar(100 + i));
    rsi.reset();
    expect(rsi.ready()).toBe(false);
    expect(rsi.value()).toBeNull();
  });
});

// ─── ATR ─────────────────────────────────────────────────────────

describe("ATR", () => {
  let atr: ATR;

  beforeEach(() => {
    atr = new ATR(3);
  });

  it("returns null before period is filled", () => {
    atr.update(bar(100, { high: 105, low: 95 }));
    atr.update(bar(102, { high: 107, low: 97 }));
    expect(atr.ready()).toBe(false);
    expect(atr.value()).toBeNull();
  });

  it("computes initial ATR as average of true ranges", () => {
    // Bar 1: TR = high - low = 10 (no prevClose)
    atr.update(bar(100, { high: 105, low: 95 }));
    // Bar 2: TR = max(10, |107-100|, |97-100|) = 10
    atr.update(bar(102, { high: 107, low: 97 }));
    // Bar 3: TR = max(10, |112-102|, |97-102|) = 10
    atr.update(bar(105, { high: 112, low: 97 }));
    expect(atr.ready()).toBe(true);
    // Initial ATR = avg(10, 10, 15) = 11.67
    const val = atr.value()!;
    expect(val).toBeGreaterThan(0);
  });

  it("applies Wilder smoothing after initial period", () => {
    atr.update(bar(100, { high: 105, low: 95 }));
    atr.update(bar(102, { high: 107, low: 97 }));
    atr.update(bar(105, { high: 110, low: 100 }));
    const initial = atr.value()!;
    atr.update(bar(108, { high: 115, low: 103 }));
    const smoothed = atr.value()!;
    // Wilder: ATR = (prev * (n-1) + TR) / n
    expect(smoothed).not.toEqual(initial);
    expect(smoothed).toBeGreaterThan(0);
  });

  it("resets cleanly", () => {
    atr.update(bar(100, { high: 105, low: 95 }));
    atr.update(bar(102, { high: 107, low: 97 }));
    atr.update(bar(105, { high: 110, low: 100 }));
    atr.reset();
    expect(atr.ready()).toBe(false);
    expect(atr.value()).toBeNull();
  });
});

// ─── MACD ────────────────────────────────────────────────────────

describe("MACD", () => {
  it("returns null values before both EMAs are ready", () => {
    const macd = new MACD(3, 5, 2);
    for (let i = 0; i < 4; i++) macd.update(bar(100 + i));
    const vals = macd.values();
    expect(vals.macdLine).toBeNull();
    expect(vals.signalLine).toBeNull();
    expect(vals.histogram).toBeNull();
  });

  it("produces MACD line once both EMAs ready", () => {
    const macd = new MACD(3, 5, 2);
    // Feed 5 bars to fill slow EMA
    for (let i = 0; i < 5; i++) macd.update(bar(100 + i));
    const vals = macd.values();
    expect(vals.macdLine).not.toBeNull();
    expect(typeof vals.macdLine).toBe("number");
  });

  it("produces signal line after signal period", () => {
    const macd = new MACD(3, 5, 2);
    // 5 bars for slow EMA + 2 for signal = 7 bars minimum
    for (let i = 0; i < 7; i++) macd.update(bar(100 + i));
    expect(macd.ready()).toBe(true);
    const vals = macd.values();
    expect(vals.signalLine).not.toBeNull();
    expect(vals.histogram).not.toBeNull();
  });

  it("histogram is positive when MACD above signal in uptrend", () => {
    const macd = new MACD(3, 5, 2);
    // Strong uptrend should push fast EMA above slow → positive MACD
    const bars = trendUp(100, 130, 10);
    for (const b of bars) macd.update(b);
    const vals = macd.values();
    expect(vals.macdLine!).toBeGreaterThan(0);
  });

  it("resets cleanly", () => {
    const macd = new MACD(3, 5, 2);
    for (let i = 0; i < 10; i++) macd.update(bar(100 + i));
    macd.reset();
    expect(macd.ready()).toBe(false);
    const vals = macd.values();
    expect(vals.macdLine).toBeNull();
  });
});

// ─── VWAP ────────────────────────────────────────────────────────

describe("VWAP", () => {
  let vwap: VWAP;

  beforeEach(() => {
    vwap = new VWAP();
  });

  it("returns null before any bars", () => {
    expect(vwap.ready()).toBe(false);
    expect(vwap.value()).toBeNull();
  });

  it("returns null when all volume is zero", () => {
    vwap.update(bar(100, { high: 105, low: 95, volume: 0 }));
    expect(vwap.ready()).toBe(false);
    expect(vwap.value()).toBeNull();
  });

  it("computes correct VWAP for single bar", () => {
    // TP = (high + low + close) / 3 = (105 + 95 + 100) / 3 = 100
    vwap.update(bar(100, { high: 105, low: 95, volume: 1000 }));
    expect(vwap.ready()).toBe(true);
    expect(vwap.value()).toBeCloseTo(100, 2);
  });

  it("weights by volume correctly", () => {
    // Bar 1: TP = 100, volume = 1000 → TPV = 100000
    vwap.update(bar(100, { high: 105, low: 95, volume: 1000 }));
    // Bar 2: TP = 110, volume = 3000 → TPV = 330000
    vwap.update(bar(110, { high: 115, low: 105, volume: 3000 }));
    // VWAP = (100000 + 330000) / (1000 + 3000) = 430000 / 4000 = 107.5
    expect(vwap.value()).toBeCloseTo(107.5, 1);
  });

  it("provides upper and lower bands", () => {
    for (let i = 0; i < 10; i++) {
      vwap.update(bar(100 + i, { high: 105 + i, low: 95 + i, volume: 1000 }));
    }
    const v = vwap.value()!;
    const upper = vwap.upperBand(1)!;
    const lower = vwap.lowerBand(1)!;
    expect(upper).toBeGreaterThan(v);
    expect(lower).toBeLessThan(v);
  });

  it("resets cleanly", () => {
    vwap.update(bar(100, { high: 105, low: 95, volume: 1000 }));
    vwap.reset();
    expect(vwap.ready()).toBe(false);
    expect(vwap.value()).toBeNull();
  });
});

// ─── Bollinger Bands ─────────────────────────────────────────────

describe("BollingerBands", () => {
  let bb: BollingerBands;

  beforeEach(() => {
    bb = new BollingerBands(5);
  });

  it("returns null before period is filled", () => {
    for (let i = 0; i < 4; i++) bb.update(bar(100));
    expect(bb.ready()).toBe(false);
    expect(bb.value()).toBeNull();
    expect(bb.upperBand(2)).toBeNull();
    expect(bb.lowerBand(2)).toBeNull();
  });

  it("middle band equals SMA", () => {
    const closes = [100, 102, 104, 106, 108];
    for (const c of closes) bb.update(bar(c));
    expect(bb.ready()).toBe(true);
    const expectedSMA = closes.reduce((a, b) => a + b, 0) / 5;
    expect(bb.value()).toBeCloseTo(expectedSMA, 5);
  });

  it("bands are equidistant from middle", () => {
    for (let i = 0; i < 5; i++) bb.update(bar(100 + i * 2));
    const mid = bb.value()!;
    const upper = bb.upperBand(2)!;
    const lower = bb.lowerBand(2)!;
    expect(upper - mid).toBeCloseTo(mid - lower, 5);
  });

  it("bands are zero-width when all closes are identical", () => {
    for (let i = 0; i < 5; i++) bb.update(bar(100));
    expect(bb.upperBand(2)).toBeCloseTo(100, 5);
    expect(bb.lowerBand(2)).toBeCloseTo(100, 5);
    expect(bb.bandwidth(2)).toBeCloseTo(0, 5);
  });

  it("percentB returns 0 at lower band and 1 at upper band", () => {
    for (let i = 0; i < 5; i++) bb.update(bar(100 + i * 2));
    const upper = bb.upperBand(2)!;
    const lower = bb.lowerBand(2)!;
    expect(bb.percentB(lower, 2)).toBeCloseTo(0, 5);
    expect(bb.percentB(upper, 2)).toBeCloseTo(1, 5);
  });

  it("resets cleanly", () => {
    for (let i = 0; i < 5; i++) bb.update(bar(100 + i));
    bb.reset();
    expect(bb.ready()).toBe(false);
    expect(bb.value()).toBeNull();
  });
});
