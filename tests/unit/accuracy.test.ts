import { describe, it, expect } from "vitest";
import { holdHoursForTimeframe } from "@/lib/accuracy";

describe("holdHoursForTimeframe", () => {
  it("returns 2 hours for 5-minute timeframe", () => {
    expect(holdHoursForTimeframe("5m", null)).toBe(2);
  });

  it("returns 72 hours for daily timeframe", () => {
    expect(holdHoursForTimeframe("1d", null)).toBe(72);
  });

  it("returns 24 hours for unknown timeframe", () => {
    expect(holdHoursForTimeframe("unknown", null)).toBe(24);
  });

  it("returns 24 hours for null timeframe", () => {
    expect(holdHoursForTimeframe(null, null)).toBe(24);
  });

  it("uses checkHours override when provided", () => {
    expect(holdHoursForTimeframe("5m", 48)).toBe(48);
    expect(holdHoursForTimeframe("1d", 6)).toBe(6);
    expect(holdHoursForTimeframe(null, 12)).toBe(12);
  });

  it("ignores zero or negative checkHours", () => {
    expect(holdHoursForTimeframe("5m", 0)).toBe(2);
    expect(holdHoursForTimeframe("1d", -1)).toBe(72);
  });
});
