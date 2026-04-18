import type { Bar } from "@/types";
import type { Indicator } from "./types";

/**
 * Average True Range — measures volatility as a smoothed average of true ranges.
 */
export class ATR implements Indicator {
  private readonly period: number;
  private prevClose: number | null = null;
  private trueRanges: number[] = [];
  private atrValue: number | null = null;
  private readonly historyValues: number[] = [];

  constructor(period = 14) {
    this.period = period;
  }

  update(bar: Bar): void {
    let tr: number;
    if (this.prevClose === null) {
      tr = bar.high - bar.low;
    } else {
      tr = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - this.prevClose),
        Math.abs(bar.low - this.prevClose)
      );
    }
    this.prevClose = bar.close;
    this.trueRanges.push(tr);

    if (this.trueRanges.length === this.period && this.atrValue === null) {
      // First ATR: simple average of first N true ranges
      this.atrValue = this.trueRanges.reduce((a, b) => a + b, 0) / this.period;
    } else if (this.atrValue !== null) {
      // Wilder's smoothing: ATR = ((prevATR * (period-1)) + currentTR) / period
      this.atrValue = (this.atrValue * (this.period - 1) + tr) / this.period;
    }

    if (this.atrValue !== null) {
      this.historyValues.push(this.atrValue);
      if (this.historyValues.length > 100) this.historyValues.shift();
    }
  }

  value(): number | null {
    return this.atrValue;
  }

  ready(): boolean {
    return this.atrValue !== null;
  }

  reset(): void {
    this.prevClose = null;
    this.trueRanges = [];
    this.atrValue = null;
    this.historyValues.length = 0;
  }

  history(): number[] {
    return [...this.historyValues];
  }
}
