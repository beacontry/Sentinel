import type { Bar } from "@/types";
import type { MACDIndicator, MACDValues } from "./types";
import { EMA } from "./ema";

export class MACD implements MACDIndicator {
  private readonly fastEMA: EMA;
  private readonly slowEMA: EMA;
  private readonly signalEMA: EMA;
  private readonly signalPeriod: number;
  private macdHistory: number[];
  private signalCount: number;
  private signalSeedSum: number;
  private signalValue: number | null;

  constructor(fast = 12, slow = 26, signal = 9) {
    this.fastEMA = new EMA(fast);
    this.slowEMA = new EMA(slow);
    this.signalEMA = new EMA(signal);
    this.signalPeriod = signal;
    this.macdHistory = [];
    this.signalCount = 0;
    this.signalSeedSum = 0;
    this.signalValue = null;
  }

  update(bar: Bar): void {
    this.fastEMA.update(bar);
    this.slowEMA.update(bar);

    if (this.fastEMA.ready() && this.slowEMA.ready()) {
      const macdLine = this.fastEMA.value()! - this.slowEMA.value()!;
      this.macdHistory.push(macdLine);
      if (this.macdHistory.length > 50) {
        this.macdHistory.shift();
      }

      this.signalCount++;
      if (this.signalCount <= this.signalPeriod) {
        this.signalSeedSum += macdLine;
        if (this.signalCount === this.signalPeriod) {
          this.signalValue = this.signalSeedSum / this.signalPeriod;
        }
      } else if (this.signalValue !== null) {
        const k = 2 / (this.signalPeriod + 1);
        this.signalValue = macdLine * k + this.signalValue * (1 - k);
      }
    }
  }

  values(): MACDValues {
    if (!this.fastEMA.ready() || !this.slowEMA.ready()) {
      return { macdLine: null, signalLine: null, histogram: null };
    }

    const macdLine = this.fastEMA.value()! - this.slowEMA.value()!;
    const signalLine = this.signalValue;
    const histogram =
      macdLine !== null && signalLine !== null
        ? macdLine - signalLine
        : null;

    return { macdLine, signalLine, histogram };
  }

  ready(): boolean {
    return this.signalValue !== null;
  }

  reset(): void {
    this.fastEMA.reset();
    this.slowEMA.reset();
    this.signalEMA.reset();
    this.macdHistory = [];
    this.signalCount = 0;
    this.signalSeedSum = 0;
    this.signalValue = null;
  }
}
