/**
 * The re-check loop the trader and admin pages run after a 402/403 that may
 * be an outage rather than a real loss of access (src/lib/recovery-poll.ts).
 * Before it, both pages stopped polling on the first denial and stayed wiped
 * until a manual reload, even once the database was back.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { accessRegained, recoveryDelay, startRecoveryPoll } from "@/lib/recovery-poll";

describe("recoveryDelay", () => {
  it("starts at the base and doubles up to the ceiling", () => {
    expect(recoveryDelay(0, 15_000, 300_000)).toBe(15_000);
    expect(recoveryDelay(1, 15_000, 300_000)).toBe(30_000);
    expect(recoveryDelay(2, 15_000, 300_000)).toBe(60_000);
    expect(recoveryDelay(5, 15_000, 300_000)).toBe(300_000);
    expect(recoveryDelay(1000, 15_000, 300_000)).toBe(300_000);
  });

  it("treats a bad attempt number as the first", () => {
    expect(recoveryDelay(-1, 15_000, 300_000)).toBe(15_000);
    expect(recoveryDelay(NaN, 15_000, 300_000)).toBe(15_000);
  });
});

describe("startRecoveryPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps checking with backoff until stopped", async () => {
    const check = vi.fn(async () => {});
    const stop = startRecoveryPoll(check, { baseMs: 1000, maxMs: 4000 });

    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(check).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(check).toHaveBeenCalledTimes(4);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(4);
  });

  it("stops once the caller sees access come back", async () => {
    // What the pages do: a good load clears the denial, which disables the
    // hook and runs this stop function.
    let stop: () => void = () => {};
    let calls = 0;
    stop = startRecoveryPoll(
      async () => {
        calls++;
        if (calls === 2) stop();
      },
      { baseMs: 1000, maxMs: 1000 },
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(2);
  });

  it("survives a check that throws", async () => {
    const check = vi.fn(async () => {
      throw new Error("network");
    });
    const stop = startRecoveryPoll(check, { baseMs: 1000, maxMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(check).toHaveBeenCalledTimes(3);
    stop();
  });

  it("runs one check at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const check = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5000));
      inFlight--;
    });
    const stop = startRecoveryPoll(check, { baseMs: 1000, maxMs: 1000 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(maxInFlight).toBe(1);
    expect(check.mock.calls.length).toBeGreaterThan(1);
    stop();
  });

  it("skips checks while the tab is hidden without advancing the backoff", async () => {
    let hidden = true;
    const check = vi.fn(async () => {});
    const stop = startRecoveryPoll(check, { baseMs: 1000, maxMs: 8000, isHidden: () => hidden });
    await vi.advanceTimersByTimeAsync(5000);
    expect(check).not.toHaveBeenCalled();
    hidden = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(check).toHaveBeenCalledTimes(1);
    // Next delay is the second step (2000), not one inflated by hidden ticks.
    await vi.advanceTimersByTimeAsync(2000);
    expect(check).toHaveBeenCalledTimes(2);
    stop();
  });

  it("a stop before the first tick means no check ever runs", async () => {
    const check = vi.fn(async () => {});
    const stop = startRecoveryPoll(check, { baseMs: 1000, maxMs: 1000 });
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(check).not.toHaveBeenCalled();
  });
});

describe("accessRegained", () => {
  it("fires only on the transition from denied back to allowed", () => {
    expect(accessRegained(402, null)).toBe(true);
    expect(accessRegained(403, null)).toBe(true);
    expect(accessRegained(null, null)).toBe(false);
    expect(accessRegained(null, 402)).toBe(false);
    expect(accessRegained(402, 402)).toBe(false);
  });
});
