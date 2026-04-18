import type { Bar } from "@/types";
import type { BandedIndicator } from "./types";

/**
 * Bollinger Bands — SMA with standard deviation bands.
 */
export class BollingerBands implements BandedIndicator {
  private readonly period: number;
  private readonly closes: number[] = [];
  private middle: number | null = null;
  private stddev: number | null = null;

  constructor(period = 20) {
    this.period = period;
  }

  update(bar: Bar): void {
    this.closes.push(bar.close);
    if (this.closes.length > this.period) {
      this.closes.shift();
    }

    if (this.closes.length >= this.period) {
      const sum = this.closes.reduce((a, b) => a + b, 0);
      this.middle = sum / this.period;

      const variance = this.closes.reduce((acc, v) => acc + (v - this.middle!) ** 2, 0) / this.period;
      this.stddev = Math.sqrt(variance);
    }
  }

  value(): number | null {
    return this.middle;
  }

  ready(): boolean {
    return this.middle !== null;
  }

  reset(): void {
    this.closes.length = 0;
    this.middle = null;
    this.stddev = null;
  }

  upperBand(stdDevs: number): number | null {
    if (this.middle === null || this.stddev === null) return null;
    return this.middle + stdDevs * this.stddev;
  }

  lowerBand(stdDevs: number): number | null {
    if (this.middle === null || this.stddev === null) return null;
    return this.middle - stdDevs * this.stddev;
  }

  /** Bandwidth as a percentage: (upper - lower) / middle * 100 */
  bandwidth(stdDevs = 2): number | null {
    const upper = this.upperBand(stdDevs);
    const lower = this.lowerBand(stdDevs);
    if (upper === null || lower === null || this.middle === null || this.middle === 0) return null;
    return ((upper - lower) / this.middle) * 100;
  }

  /** %B: where price sits relative to the bands (0 = lower, 1 = upper) */
  percentB(price: number, stdDevs = 2): number | null {
    const upper = this.upperBand(stdDevs);
    const lower = this.lowerBand(stdDevs);
    if (upper === null || lower === null || upper === lower) return null;
    return (price - lower) / (upper - lower);
  }

  getStdDev(): number | null {
    return this.stddev;
  }
}
