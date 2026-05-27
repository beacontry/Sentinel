/**
 * Tests for cooperative scan cancellation (PR 21c, 2026-05-26).
 *
 * Closes the "orphan promise" hole noted by PR 17's audit P1 #6: when
 * runScanGuarded's 10-min override fires, the in-flight scan was abandoned
 * but still resolving in the background, racing against the new scan on
 * engine state (cooldowns, dailyNotional, broker order placement).
 *
 * The fix: each scan captures `myGeneration = ++engine.scanGeneration` at
 * start. New scans bump the counter. The stale scan calls
 * `throwIfScanCancelled` at every major yield point — if its captured
 * generation no longer matches engine.scanGeneration, throws
 * ScanCancelledError and exits.
 */

import { describe, it, expect } from "vitest";
import {
  ScanCancelledError,
  throwIfScanCancelled,
  type EngineState,
} from "@/lib/trading-engine";

function makeMinimalEngineWithGeneration(gen: number): EngineState {
  // Only scanGeneration matters for the cancellation logic; cast through
  // unknown to bypass the full EngineState shape (the helper only reads one
  // field).
  return { scanGeneration: gen } as unknown as EngineState;
}

describe("throwIfScanCancelled", () => {
  it("is a no-op when caller's generation matches engine's current generation", () => {
    const engine = makeMinimalEngineWithGeneration(5);
    // Should not throw
    expect(() => throwIfScanCancelled(engine, 5)).not.toThrow();
  });

  it("throws ScanCancelledError when caller's generation is stale", () => {
    const engine = makeMinimalEngineWithGeneration(7);
    expect(() => throwIfScanCancelled(engine, 5)).toThrow(ScanCancelledError);
  });

  it("ScanCancelledError carries both generations in the message for diagnostics", () => {
    const engine = makeMinimalEngineWithGeneration(7);
    try {
      throwIfScanCancelled(engine, 5);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ScanCancelledError);
      expect((err as Error).message).toContain("5");
      expect((err as Error).message).toContain("7");
    }
  });

  it("throws when caller's generation is newer (defensive — shouldn't happen but bias toward exit)", () => {
    // This case shouldn't occur in production (generations only increase),
    // but if it does we still want a cancellation rather than continuing to
    // place orders against an undefined state.
    const engine = makeMinimalEngineWithGeneration(3);
    expect(() => throwIfScanCancelled(engine, 5)).toThrow(ScanCancelledError);
  });
});

describe("ScanCancelledError", () => {
  it("has name set to ScanCancelledError (for typeof checks in scan handlers)", () => {
    const err = new ScanCancelledError(1, 2);
    expect(err.name).toBe("ScanCancelledError");
  });

  it("is catchable as a regular Error", () => {
    const err = new ScanCancelledError(1, 2);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("generation lifecycle (simulating runScan flow)", () => {
  it("a single scan runs to completion when no override fires", () => {
    const engine = makeMinimalEngineWithGeneration(0);
    // Scan A starts
    engine.scanGeneration++;
    const myGen_A = engine.scanGeneration;
    expect(myGen_A).toBe(1);

    // Mid-scan check
    throwIfScanCancelled(engine, myGen_A);

    // End of scan — still active
    throwIfScanCancelled(engine, myGen_A);
  });

  it("an orphaned scan throws at its next yield point after a newer scan starts", () => {
    const engine = makeMinimalEngineWithGeneration(0);

    // Scan A starts
    engine.scanGeneration++;
    const myGen_A = engine.scanGeneration; // = 1

    // Scan A hangs... 10 min later override fires, Scan B starts
    engine.scanGeneration++;
    const myGen_B = engine.scanGeneration; // = 2

    // Scan A unhangs, hits its next yield point
    expect(() => throwIfScanCancelled(engine, myGen_A)).toThrow(ScanCancelledError);

    // Scan B keeps going just fine
    expect(() => throwIfScanCancelled(engine, myGen_B)).not.toThrow();
  });

  it("multiple back-to-back scans only ever leave the newest one active", () => {
    const engine = makeMinimalEngineWithGeneration(0);

    // Scans A, B, C start (rapid succession, all stale on completion)
    engine.scanGeneration++; const genA = engine.scanGeneration;
    engine.scanGeneration++; const genB = engine.scanGeneration;
    engine.scanGeneration++; const genC = engine.scanGeneration;

    expect(() => throwIfScanCancelled(engine, genA)).toThrow(ScanCancelledError);
    expect(() => throwIfScanCancelled(engine, genB)).toThrow(ScanCancelledError);
    expect(() => throwIfScanCancelled(engine, genC)).not.toThrow();
  });
});
