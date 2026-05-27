/**
 * Tests for engine state persistence (PR 21b, 2026-05-26).
 *
 * Pins the serialize/deserialize round-trip — the actual DB save/load is
 * thin wrapper over drizzle UPSERT, covered by integration testing in
 * the manual deploy verification.
 */

import { describe, it, expect } from "vitest";
import {
  serializeEngineState,
  deserializeEngineState,
  SNAPSHOT_VERSION,
  type SerializableEngineFields,
  type SerializableTrackedPosition,
} from "@/lib/engine-snapshot";

function makeFields(overrides: Partial<SerializableEngineFields> = {}): SerializableEngineFields {
  return {
    mode: "optimized",
    dailyLoss: -125.5,
    dailyLossDate: "2026-05-26",
    dailyNotional: 8400,
    consecutiveLosses: 2,
    bootEquitySnapshotDate: "2026-05-26",
    boot: { equity: 50_000, accountNumber: "PA12345678" },
    pendingExits: new Set(["AAPL"]),
    cooldowns: new Map([["TSLA", 1_700_000_000_000], ["NVDA", 1_700_000_500_000]]),
    recentOrderTimestamps: [1_700_000_100_000, 1_700_000_200_000],
    exitRejectionCount: new Map([["MRVL", 3]]),
    exitSuppressedUntil: new Map([["DELL", 1_700_001_000_000]]),
    unprotectedSymbols: new Set(["AMD"]),
    ...overrides,
  };
}

function makePosition(symbol: string, overrides: Partial<SerializableTrackedPosition> = {}): SerializableTrackedPosition {
  return {
    symbol,
    qty: 100,
    entryPrice: 150.25,
    peakPrice: 165.50,
    stopLoss: 142.50,
    takeProfit: 195.32,
    trailingStopPct: 0.08,
    entryDate: new Date("2026-05-20T14:30:00.000Z"),
    holdPeriod: 30,
    atr: 4.5,
    rsi: 62,
    ...overrides,
  };
}

describe("serializeEngineState / deserializeEngineState", () => {
  it("round-trips all SerializableEngineFields with no loss", () => {
    const fields = makeFields();
    const positions = new Map([
      ["AAPL", makePosition("AAPL")],
      ["NVDA", makePosition("NVDA", { qty: 50, entryPrice: 800 })],
    ]);

    const payload = serializeEngineState(fields, positions);
    const restored = deserializeEngineState(JSON.parse(JSON.stringify(payload)));

    expect(restored).not.toBeNull();
    expect(restored!.fields.mode).toBe("optimized");
    expect(restored!.fields.dailyLoss).toBe(-125.5);
    expect(restored!.fields.dailyLossDate).toBe("2026-05-26");
    expect(restored!.fields.dailyNotional).toBe(8400);
    expect(restored!.fields.consecutiveLosses).toBe(2);
    expect(restored!.fields.boot).toEqual({ equity: 50_000, accountNumber: "PA12345678" });
    expect(restored!.fields.pendingExits).toEqual(new Set(["AAPL"]));
    expect(Array.from(restored!.fields.cooldowns.entries())).toEqual([
      ["TSLA", 1_700_000_000_000],
      ["NVDA", 1_700_000_500_000],
    ]);
    expect(restored!.fields.recentOrderTimestamps).toEqual([1_700_000_100_000, 1_700_000_200_000]);
    expect(Array.from(restored!.fields.exitRejectionCount.entries())).toEqual([["MRVL", 3]]);
    expect(Array.from(restored!.fields.exitSuppressedUntil.entries())).toEqual([
      ["DELL", 1_700_001_000_000],
    ]);
    expect(restored!.fields.unprotectedSymbols).toEqual(new Set(["AMD"]));
    expect(restored!.positions.size).toBe(2);
    expect(restored!.positions.get("AAPL")!.qty).toBe(100);
    expect(restored!.positions.get("NVDA")!.entryPrice).toBe(800);
  });

  it("preserves Date types on positions through JSON round-trip", () => {
    const fields = makeFields();
    const positions = new Map([
      ["MRVL", makePosition("MRVL", { entryDate: new Date("2026-05-15T09:30:00.000Z") })],
    ]);
    const payload = serializeEngineState(fields, positions);
    const restored = deserializeEngineState(JSON.parse(JSON.stringify(payload)));

    expect(restored!.positions.get("MRVL")!.entryDate).toBeInstanceOf(Date);
    expect(restored!.positions.get("MRVL")!.entryDate.toISOString()).toBe(
      "2026-05-15T09:30:00.000Z"
    );
  });

  it("returns null on version mismatch — caller boots cold", () => {
    const payload = { v: SNAPSHOT_VERSION + 99, mode: "optimized", positions: [] };
    expect(deserializeEngineState(payload)).toBeNull();
  });

  it("returns null on non-object input (corrupt JSON column)", () => {
    expect(deserializeEngineState(null)).toBeNull();
    expect(deserializeEngineState("garbage")).toBeNull();
    expect(deserializeEngineState(42)).toBeNull();
  });

  it("tolerates missing optional fields gracefully", () => {
    const minimal = {
      v: SNAPSHOT_VERSION,
      mode: "moderate",
      dailyLoss: 0,
      dailyLossDate: "",
      dailyNotional: 0,
      consecutiveLosses: 0,
      bootEquitySnapshotDate: "",
      boot: null,
      pendingExits: [],
      cooldowns: [],
      recentOrderTimestamps: [],
      exitRejectionCount: [],
      exitSuppressedUntil: [],
      unprotectedSymbols: [],
      positions: [],
    };
    const restored = deserializeEngineState(minimal);
    expect(restored).not.toBeNull();
    expect(restored!.fields.cooldowns.size).toBe(0);
    expect(restored!.positions.size).toBe(0);
  });

  it("serializes empty maps/sets as empty arrays (consumable by JSONB)", () => {
    const fields = makeFields({
      pendingExits: new Set(),
      cooldowns: new Map(),
      recentOrderTimestamps: [],
      exitRejectionCount: new Map(),
      exitSuppressedUntil: new Map(),
      unprotectedSymbols: new Set(),
    });
    const payload = serializeEngineState(fields, new Map());
    expect(payload.pendingExits).toEqual([]);
    expect(payload.cooldowns).toEqual([]);
    expect(payload.recentOrderTimestamps).toEqual([]);
    expect(payload.positions).toEqual([]);
  });

  it("serializes payload version on every save (forward-compat marker)", () => {
    const payload = serializeEngineState(makeFields(), new Map());
    expect(payload.v).toBe(SNAPSHOT_VERSION);
  });

  it("preserves optional position fields (atr, rsi, currentPrice, marketValue)", () => {
    const positions = new Map([
      [
        "WITH_ALL",
        makePosition("WITH_ALL", {
          atr: 5.5,
          rsi: 68,
          currentPrice: 175.10,
          marketValue: 17_510,
        }),
      ],
      [
        "MINIMAL",
        makePosition("MINIMAL", { atr: undefined, rsi: undefined, currentPrice: undefined, marketValue: undefined }),
      ],
    ]);
    const payload = serializeEngineState(makeFields(), positions);
    const restored = deserializeEngineState(JSON.parse(JSON.stringify(payload)));
    expect(restored!.positions.get("WITH_ALL")!.atr).toBe(5.5);
    expect(restored!.positions.get("WITH_ALL")!.rsi).toBe(68);
    expect(restored!.positions.get("WITH_ALL")!.currentPrice).toBe(175.10);
    expect(restored!.positions.get("WITH_ALL")!.marketValue).toBe(17_510);
    expect(restored!.positions.get("MINIMAL")!.atr).toBeUndefined();
  });
});
