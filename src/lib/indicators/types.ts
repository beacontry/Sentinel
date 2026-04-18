import type { Bar } from "@/types";

export interface Indicator {
  update(bar: Bar): void;
  value(): number | null;
  ready(): boolean;
  reset(): void;
}

export interface BandedIndicator extends Indicator {
  upperBand(stdDevs: number): number | null;
  lowerBand(stdDevs: number): number | null;
}

export interface MACDValues {
  macdLine: number | null;
  signalLine: number | null;
  histogram: number | null;
}

export interface MACDIndicator {
  update(bar: Bar): void;
  values(): MACDValues;
  ready(): boolean;
  reset(): void;
}
