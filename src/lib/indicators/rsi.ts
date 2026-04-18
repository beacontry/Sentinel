import type { Bar } from "@/types";
import type { Indicator } from "./types";

export class RSI implements Indicator {
  private readonly period: number;
  private prevClose: number | null;
  private avgGain: number;
  private avgLoss: number;
  private count: number;
  private gains: number[];
  private losses: number[];

  constructor(period = 14) {
    this.period = period;
    this.prevClose = null;
    this.avgGain = 0;
    this.avgLoss = 0;
    this.count = 0;
    this.gains = [];
    this.losses = [];
  }

  update(bar: Bar): void {
    if (this.prevClose === null) {
      this.prevClose = bar.close;
      return;
    }

    const change = bar.close - this.prevClose;
    this.prevClose = bar.close;
    this.count++;

    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (this.count <= this.period) {
      this.gains.push(gain);
      this.losses.push(loss);

      if (this.count === this.period) {
        this.avgGain = this.gains.reduce((a, b) => a + b, 0) / this.period;
        this.avgLoss = this.losses.reduce((a, b) => a + b, 0) / this.period;
        this.gains = [];
        this.losses = [];
      }
    } else {
      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
    }
  }

  value(): number | null {
    if (!this.ready()) return null;
    if (this.avgLoss === 0) return 100;
    const rs = this.avgGain / this.avgLoss;
    return 100 - 100 / (1 + rs);
  }

  ready(): boolean {
    return this.count >= this.period;
  }

  reset(): void {
    this.prevClose = null;
    this.avgGain = 0;
    this.avgLoss = 0;
    this.count = 0;
    this.gains = [];
    this.losses = [];
  }
}
