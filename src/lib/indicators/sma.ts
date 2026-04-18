import type { Bar } from "@/types";
import type { Indicator } from "./types";

export class SMA implements Indicator {
  private readonly window: number;
  private readonly buffer: number[];
  private sum: number;
  private head: number;
  private count: number;

  constructor(window: number) {
    this.window = window;
    this.buffer = new Array<number>(window).fill(0);
    this.sum = 0;
    this.head = 0;
    this.count = 0;
  }

  update(bar: Bar): void {
    const price = bar.close;
    if (this.count >= this.window) {
      this.sum -= this.buffer[this.head];
    }
    this.buffer[this.head] = price;
    this.sum += price;
    this.head = (this.head + 1) % this.window;
    if (this.count < this.window) {
      this.count++;
    }
  }

  value(): number | null {
    if (!this.ready()) return null;
    return this.sum / this.window;
  }

  ready(): boolean {
    return this.count >= this.window;
  }

  reset(): void {
    this.buffer.fill(0);
    this.sum = 0;
    this.head = 0;
    this.count = 0;
  }

  /** Expose the full ordered history of values in the buffer for crossover detection. */
  history(): number[] {
    if (!this.ready()) return [];
    const result: number[] = [];
    for (let i = 0; i < this.window; i++) {
      result.push(this.buffer[(this.head + i) % this.window]);
    }
    return result;
  }
}
