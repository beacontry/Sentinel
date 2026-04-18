import type { Bar } from "@/types";
import type { Indicator } from "./types";

export class EMA implements Indicator {
  private readonly window: number;
  private readonly k: number;
  private emaValue: number | null;
  private count: number;
  private seedSum: number;
  private readonly recentValues: number[];
  private readonly maxHistory: number;

  constructor(window: number, maxHistory = 50) {
    this.window = window;
    this.k = 2 / (window + 1);
    this.emaValue = null;
    this.count = 0;
    this.seedSum = 0;
    this.maxHistory = maxHistory;
    this.recentValues = [];
  }

  update(bar: Bar): void {
    const price = bar.close;
    this.count++;

    if (this.count <= this.window) {
      this.seedSum += price;
      if (this.count === this.window) {
        this.emaValue = this.seedSum / this.window;
      }
    } else if (this.emaValue !== null) {
      this.emaValue = price * this.k + this.emaValue * (1 - this.k);
    }

    if (this.emaValue !== null) {
      this.recentValues.push(this.emaValue);
      if (this.recentValues.length > this.maxHistory) {
        this.recentValues.shift();
      }
    }
  }

  value(): number | null {
    return this.emaValue;
  }

  ready(): boolean {
    return this.emaValue !== null;
  }

  reset(): void {
    this.emaValue = null;
    this.count = 0;
    this.seedSum = 0;
    this.recentValues.length = 0;
  }

  /** Recent EMA values for crossover detection. */
  history(): number[] {
    return [...this.recentValues];
  }
}
