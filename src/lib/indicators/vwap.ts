import type { Bar } from "@/types";
import type { BandedIndicator } from "./types";

export class VWAP implements BandedIndicator {
  private cumulativeTPV: number;
  private cumulativeVolume: number;
  private cumulativeTPV2: number;
  private barCount: number;

  constructor() {
    this.cumulativeTPV = 0;
    this.cumulativeVolume = 0;
    this.cumulativeTPV2 = 0;
    this.barCount = 0;
  }

  update(bar: Bar): void {
    const tp = (bar.high + bar.low + bar.close) / 3;
    this.cumulativeTPV += tp * bar.volume;
    this.cumulativeVolume += bar.volume;
    this.cumulativeTPV2 += tp * tp * bar.volume;
    this.barCount++;
  }

  value(): number | null {
    if (!this.ready()) return null;
    return this.cumulativeTPV / this.cumulativeVolume;
  }

  ready(): boolean {
    return this.cumulativeVolume > 0 && this.barCount > 0;
  }

  reset(): void {
    this.cumulativeTPV = 0;
    this.cumulativeVolume = 0;
    this.cumulativeTPV2 = 0;
    this.barCount = 0;
  }

  private standardDeviation(): number {
    if (!this.ready()) return 0;
    const vwap = this.cumulativeTPV / this.cumulativeVolume;
    const meanSquare = this.cumulativeTPV2 / this.cumulativeVolume;
    const variance = meanSquare - vwap * vwap;
    return Math.sqrt(Math.max(0, variance));
  }

  upperBand(stdDevs: number): number | null {
    const v = this.value();
    if (v === null) return null;
    return v + this.standardDeviation() * stdDevs;
  }

  lowerBand(stdDevs: number): number | null {
    const v = this.value();
    if (v === null) return null;
    return v - this.standardDeviation() * stdDevs;
  }
}
