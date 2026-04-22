import type { Bar } from "@/types";

/** Create a single mock bar with sensible defaults. */
export function bar(close: number, overrides: Partial<Bar> = {}): Bar {
  return {
    date: new Date().toISOString(),
    open: overrides.open ?? close * 0.999,
    high: overrides.high ?? close * 1.005,
    low: overrides.low ?? close * 0.995,
    close,
    volume: overrides.volume ?? 100_000,
    ...overrides,
  };
}

/** Generate a sequence of bars with linearly interpolated closes. */
export function barSequence(closes: number[]): Bar[] {
  const base = Date.now() - closes.length * 300_000; // 5 min apart
  return closes.map((c, i) => ({
    date: new Date(base + i * 300_000).toISOString(),
    open: c * 0.999,
    high: c * 1.005,
    low: c * 0.995,
    close: c,
    volume: 100_000,
  }));
}

/** Generate n bars trending upward from start to end with realistic pullbacks.
 *  Pattern: 3 up bars, 1 down bar — keeps RSI in a healthy range. */
export function trendUp(start: number, end: number, n: number): Bar[] {
  const totalMove = end - start;
  const closes: number[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const progress = i / (n - 1);
    const target = start + totalMove * progress;
    // Pull back every 3rd bar to keep RSI healthy
    if (i % 4 === 3) {
      price = target - totalMove / n * 1.2;
    } else {
      price = target + totalMove / n * 0.3;
    }
    closes.push(Math.max(price, start * 0.95));
  }
  return barSequence(closes);
}

/** Generate n bars trending downward from start to end with realistic bounces.
 *  Pattern: 3 down bars, 1 up bar — keeps RSI from pinning to 0. */
export function trendDown(start: number, end: number, n: number): Bar[] {
  const totalMove = start - end;
  const closes: number[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const progress = i / (n - 1);
    const target = start - totalMove * progress;
    // Bounce every 3rd bar to keep RSI from pinning to 0
    if (i % 4 === 3) {
      price = target + totalMove / n * 1.2;
    } else {
      price = target - totalMove / n * 0.3;
    }
    closes.push(Math.min(price, start * 1.05));
  }
  return barSequence(closes);
}

/** Generate n bars oscillating around a center price. */
export function flatBars(center: number, n: number, noise = 0.5): Bar[] {
  return barSequence(
    Array.from({ length: n }, (_, i) =>
      center + (i % 2 === 0 ? noise : -noise)
    )
  );
}
