/**
 * Tests for the setBrokerConnected helper in trading-engine.ts.
 *
 * Context: 2026-05-26 mystery — watchdog fired "Broker unreachable (0
 * consecutive failures)" 96 times in 24h for an engine whose scans were
 * actually reaching the brokerConnected=true assignment. The fix
 * centralizes every brokerConnected mutation behind this helper so:
 *   (a) every transition is logged with a `source` label — future
 *       incidents can grep journald for the exact transition history
 *   (b) the helper is idempotent (no log spam when value already matches)
 *   (c) startEngine sets brokerConnected=true immediately after the
 *       successful getAccount() that already proves reachability, so the
 *       state is correct from the moment the engine starts (previously
 *       it waited for the first scan body, which can be deferred or hung)
 *
 * The helper isn't exported; mirroring the body here following the same
 * convention as tests/unit/engine-safeguards.test.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";

interface MinimalEngine {
  userId: string | null;
  brokerConnected: boolean;
  logEntries: Array<{ from: boolean; to: boolean; source: string }>;
}

function setBrokerConnected(
  engine: MinimalEngine,
  value: boolean,
  source: string
): void {
  if (engine.brokerConnected === value) return;
  engine.logEntries.push({ from: engine.brokerConnected, to: value, source });
  engine.brokerConnected = value;
}

let engine: MinimalEngine;

beforeEach(() => {
  engine = {
    userId: "test-user",
    brokerConnected: false,
    logEntries: [],
  };
});

describe("setBrokerConnected", () => {
  it("transitions false → true and logs the transition with source", () => {
    setBrokerConnected(engine, true, "startEngine_getAccount");
    expect(engine.brokerConnected).toBe(true);
    expect(engine.logEntries).toEqual([
      { from: false, to: true, source: "startEngine_getAccount" },
    ]);
  });

  it("transitions true → false and logs the transition with source", () => {
    engine.brokerConnected = true;
    setBrokerConnected(engine, false, "runScan_consecutive_failures_threshold");
    expect(engine.brokerConnected).toBe(false);
    expect(engine.logEntries).toEqual([
      { from: true, to: false, source: "runScan_consecutive_failures_threshold" },
    ]);
  });

  it("is idempotent — calling with the current value is a no-op (no log)", () => {
    engine.brokerConnected = true;
    setBrokerConnected(engine, true, "runScan_getPositions");
    setBrokerConnected(engine, true, "runTacticalScan_getPositions");
    setBrokerConnected(engine, true, "runTacticalSmartScan_getPositions");
    expect(engine.brokerConnected).toBe(true);
    expect(engine.logEntries).toHaveLength(0);
  });

  it("logs every distinct transition in a sequence", () => {
    setBrokerConnected(engine, true, "startEngine_getAccount");
    setBrokerConnected(engine, true, "runScan_getPositions"); // no-op
    setBrokerConnected(engine, false, "runScan_consecutive_failures_threshold");
    setBrokerConnected(engine, true, "runTacticalSmartScan_getPositions");
    expect(engine.brokerConnected).toBe(true);
    expect(engine.logEntries.map((e) => e.source)).toEqual([
      "startEngine_getAccount",
      "runScan_consecutive_failures_threshold",
      "runTacticalSmartScan_getPositions",
    ]);
  });

  it("preserves the from-value in the log entry for hash-chain-style forensics", () => {
    engine.brokerConnected = true;
    setBrokerConnected(engine, false, "x");
    setBrokerConnected(engine, true, "y");
    expect(engine.logEntries).toEqual([
      { from: true, to: false, source: "x" },
      { from: false, to: true, source: "y" },
    ]);
  });
});

describe("setBrokerConnected — regression scenarios", () => {
  it("startEngine fix — fresh engine flips to true on first getAccount success", () => {
    // Models the new startEngine flow: engine init has brokerConnected=false,
    // getAccount succeeds, helper called → state correct before any scan runs.
    expect(engine.brokerConnected).toBe(false);
    setBrokerConnected(engine, true, "startEngine_getAccount");
    expect(engine.brokerConnected).toBe(true);
    expect(engine.logEntries).toHaveLength(1);
  });

  it("repeated scans don't spam the log when state is already correct", () => {
    // After startEngine sets it true, every subsequent scan calls the helper
    // again with true. The idempotency check means logs stay clean — we
    // ONLY see entries when state actually flipped.
    setBrokerConnected(engine, true, "startEngine_getAccount");
    for (let i = 0; i < 100; i++) {
      setBrokerConnected(engine, true, `runScan_getPositions_iteration_${i}`);
    }
    expect(engine.logEntries).toHaveLength(1);
    expect(engine.logEntries[0].source).toBe("startEngine_getAccount");
  });
});
