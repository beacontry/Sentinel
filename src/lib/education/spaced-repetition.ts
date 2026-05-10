/**
 * SM-2 spaced-repetition algorithm (simplified).
 *
 * Reviews are graded on a 0–5 quality scale (Anki-style):
 *   0 — Total blackout
 *   1 — Wrong, but the answer felt familiar
 *   2 — Wrong, but on seeing the answer it was easy
 *   3 — Correct, but with significant effort
 *   4 — Correct, after some hesitation
 *   5 — Perfect recall
 *
 * Quality < 3 is a "lapse" — interval resets, ease factor drops.
 * Quality >= 3 = success — interval grows, ease factor adjusts.
 *
 * Ease factor stored as integer ×100 in DB to avoid float precision issues
 * (250 = 2.50, etc.). Standard SM-2 starts new cards at 2.5.
 */

export interface SpacedRepState {
  /** Stored as ×100 integer (250 = 2.50). */
  easeFactor: number;
  /** Days until next review. */
  intervalDays: number;
  /** Total review count. */
  reviewCount: number;
  /** Total failures (quality < 3). */
  lapses: number;
}

export interface ReviewResult extends SpacedRepState {
  /** Date the next review is due. */
  nextReviewAt: Date;
}

const MIN_EASE = 130; // 1.30 floor
const MAX_EASE = 350; // 3.50 ceiling

export const QUALITY_LABELS: Record<number, { label: string; description: string }> = {
  0: { label: "Forgot", description: "Total blackout" },
  1: { label: "Hard", description: "Wrong but familiar" },
  2: { label: "Tough", description: "Wrong; obvious in hindsight" },
  3: { label: "Good", description: "Right with effort" },
  4: { label: "Easy", description: "Right with little hesitation" },
  5: { label: "Perfect", description: "Instant recall" },
};

/**
 * Compute the next review state given the previous state and a quality grade.
 * Pure function; no I/O. The DB upsert layer wraps this.
 */
export function applyReview(
  prev: SpacedRepState,
  quality: number,
  now: Date = new Date(),
): ReviewResult {
  // Clamp quality 0..5
  const q = Math.max(0, Math.min(5, Math.floor(quality)));

  let { easeFactor, intervalDays, reviewCount, lapses } = prev;
  reviewCount += 1;

  if (q < 3) {
    // Lapse: reset interval, count lapse, reduce ease
    intervalDays = 1;
    lapses += 1;
    // Apply ease adjustment (still penalized)
  } else {
    // Success path — interval grows
    if (intervalDays === 0) {
      intervalDays = 1;
    } else if (intervalDays === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * (easeFactor / 100));
    }
  }

  // Update ease factor (SM-2 formula adapted for integer storage)
  // EF' = EF + (0.1 - (5-q) × (0.08 + (5-q) × 0.02))
  // In integer-x100 form:
  const efDelta = Math.round(
    100 * (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );
  easeFactor = Math.max(MIN_EASE, Math.min(MAX_EASE, easeFactor + efDelta));

  const nextReviewAt = new Date(now);
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  return {
    easeFactor,
    intervalDays,
    reviewCount,
    lapses,
    nextReviewAt,
  };
}

/** Initial state for a card the user has never reviewed. */
export function initialState(): SpacedRepState {
  return {
    easeFactor: 250,
    intervalDays: 0,
    reviewCount: 0,
    lapses: 0,
  };
}
