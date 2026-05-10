import { describe, it, expect } from "vitest";
import {
  applyReview,
  initialState,
} from "@/lib/education/spaced-repetition";

describe("applyReview (SM-2)", () => {
  const fixedNow = new Date("2026-01-01T00:00:00Z");

  it("first successful review sets interval to 1 day", () => {
    const r = applyReview(initialState(), 4, fixedNow);
    expect(r.intervalDays).toBe(1);
    expect(r.nextReviewAt.getTime()).toBe(
      fixedNow.getTime() + 1 * 86400 * 1000,
    );
  });

  it("second successful review sets interval to 6 days", () => {
    const after1 = applyReview(initialState(), 4, fixedNow);
    const after2 = applyReview(after1, 4, fixedNow);
    expect(after2.intervalDays).toBe(6);
  });

  it("third successful review multiplies by ease factor", () => {
    const after1 = applyReview(initialState(), 4, fixedNow);
    const after2 = applyReview(after1, 4, fixedNow);
    const after3 = applyReview(after2, 4, fixedNow);
    expect(after3.intervalDays).toBeGreaterThan(6);
    expect(after3.intervalDays).toBeLessThanOrEqual(20);
  });

  it("lapse (q < 3) resets interval to 1 and increments lapses", () => {
    const after1 = applyReview(initialState(), 4, fixedNow);
    const after2 = applyReview(after1, 4, fixedNow);
    const lapsed = applyReview(after2, 1, fixedNow);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.lapses).toBe(1);
  });

  it("lapse drops ease factor", () => {
    const initial = initialState();
    const lapsed = applyReview(initial, 0, fixedNow);
    expect(lapsed.easeFactor).toBeLessThan(initial.easeFactor);
  });

  it("perfect recall (q=5) raises ease factor", () => {
    const initial = initialState();
    const perfect = applyReview(initial, 5, fixedNow);
    expect(perfect.easeFactor).toBeGreaterThanOrEqual(initial.easeFactor);
  });

  it("ease factor floors at 130", () => {
    let state = initialState();
    for (let i = 0; i < 50; i++) {
      state = applyReview(state, 0, fixedNow);
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(130);
  });

  it("ease factor caps at 350", () => {
    let state = initialState();
    for (let i = 0; i < 50; i++) {
      state = applyReview(state, 5, fixedNow);
    }
    expect(state.easeFactor).toBeLessThanOrEqual(350);
  });

  it("review count increments on every review", () => {
    let state = initialState();
    state = applyReview(state, 5, fixedNow);
    state = applyReview(state, 1, fixedNow);
    state = applyReview(state, 4, fixedNow);
    expect(state.reviewCount).toBe(3);
  });

  it("clamps quality outside 0-5 range", () => {
    const r1 = applyReview(initialState(), 99, fixedNow);
    const r2 = applyReview(initialState(), -10, fixedNow);
    // Quality 99 → clamped to 5 (success); -10 → clamped to 0 (lapse)
    expect(r1.intervalDays).toBeGreaterThanOrEqual(1);
    expect(r2.lapses).toBe(1);
  });

  it("computes next review date correctly", () => {
    const after1 = applyReview(initialState(), 4, fixedNow);
    const after2 = applyReview(after1, 4, fixedNow);
    expect(after2.nextReviewAt.getTime()).toBe(
      fixedNow.getTime() + 6 * 86400 * 1000,
    );
  });
});
