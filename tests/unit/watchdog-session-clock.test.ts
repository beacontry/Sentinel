/**
 * Tests for msSinceSessionOpen — the watchdog stall-clock clamp added after
 * weekend-gap false positives ("Engine has not scanned in 3,942 min during
 * market hours" every Monday open: lastScanAt was Friday afternoon, but the
 * engine had only had minutes of MARKET time to scan).
 *
 * Fixed UTC instants with known ET wall times (2026-07-14 is EDT, UTC−4;
 * 2026-01-14 is EST, UTC−5) so the test is deterministic across host zones.
 */

import { describe, it, expect } from "vitest";
import { msSinceSessionOpen } from "@/lib/engine-watchdog";

describe("msSinceSessionOpen", () => {
  it("is 5 minutes at 9:35 ET on an EDT date", () => {
    // 2026-07-14 13:35 UTC = 09:35 EDT
    const now = Date.UTC(2026, 6, 14, 13, 35, 0);
    expect(msSinceSessionOpen(now)).toBe(5 * 60 * 1000);
  });

  it("is 5 minutes at 9:35 ET on an EST date (winter offset)", () => {
    // 2026-01-14 14:35 UTC = 09:35 EST
    const now = Date.UTC(2026, 0, 14, 14, 35, 0);
    expect(msSinceSessionOpen(now)).toBe(5 * 60 * 1000);
  });

  it("is 6.5h at the 16:00 ET close", () => {
    // 2026-07-14 20:00 UTC = 16:00 EDT
    const now = Date.UTC(2026, 6, 14, 20, 0, 0);
    expect(msSinceSessionOpen(now)).toBe(6.5 * 60 * 60 * 1000);
  });

  it("is negative before the open (watchdog clamp suppresses alerts)", () => {
    // 2026-07-14 13:00 UTC = 09:00 EDT
    const now = Date.UTC(2026, 6, 14, 13, 0, 0);
    expect(msSinceSessionOpen(now)).toBeLessThan(0);
  });

  it("clamps a weekend-stale lastScanAt below the 32-min stall threshold at Monday 9:45", () => {
    // Monday 2026-07-13 13:45 UTC = 09:45 EDT; lastScanAt Friday 19:55 UTC.
    const mondayNow = Date.UTC(2026, 6, 13, 13, 45, 0);
    const fridayScan = Date.UTC(2026, 6, 10, 19, 55, 0);
    const wallAge = mondayNow - fridayScan; // ~66h — the pre-fix false positive
    const clamped = Math.min(wallAge, msSinceSessionOpen(mondayNow));
    expect(wallAge).toBeGreaterThan(32 * 60 * 1000);
    expect(clamped).toBe(15 * 60 * 1000); // 9:30 → 9:45
    expect(clamped).toBeLessThan(32 * 60 * 1000);
  });
});
