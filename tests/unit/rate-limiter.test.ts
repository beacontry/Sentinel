import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Re-import module fresh for each test suite to reset globalThis state
let rateLimit: typeof import("@/lib/rate-limiter").rateLimit;

describe("rateLimit", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import("@/lib/rate-limiter");
    rateLimit = mod.rateLimit;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const r1 = rateLimit("test:a", 3, 10);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit("test:a", 3, 10);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit("test:a", 3, 10);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests past the limit", () => {
    rateLimit("test:b", 2, 10);
    rateLimit("test:b", 2, 10);

    const r3 = rateLimit("test:b", 2, 10);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    rateLimit("test:c", 1, 5);
    expect(rateLimit("test:c", 1, 5).allowed).toBe(false);

    // Advance past the 5-second window
    vi.advanceTimersByTime(6000);

    const result = rateLimit("test:c", 1, 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("tracks different keys independently", () => {
    rateLimit("test:d", 1, 10);
    expect(rateLimit("test:d", 1, 10).allowed).toBe(false);

    // Different key should still be allowed
    const other = rateLimit("test:e", 1, 10);
    expect(other.allowed).toBe(true);
  });
});
