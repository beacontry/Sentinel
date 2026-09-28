/**
 * Re-check loop for a screen that lost access on a status that can also mean
 * an outage. checkTier answers 402 when the tier read fails (getUserTier falls
 * back to 'free'), and the role gates answer 403 when getCurrentRole cannot
 * read the role. A screen that treated either as final would stay wiped until
 * a reload. This retries with exponential backoff until the caller stops it,
 * which the screens do once a check succeeds and access is back.
 *
 * Framework-free so the scheduling can be tested with fake timers; the
 * useRecoveryPoll hook wraps it for the pages.
 */

export interface RecoveryPollOptions {
  baseMs: number;
  maxMs: number;
  /** A hidden tab skips the check but keeps its place in the backoff. */
  isHidden?: () => boolean;
}

/** Delay before check number `attempt` (0-based): base, 2x, 4x, capped. */
export function recoveryDelay(attempt: number, baseMs: number, maxMs: number): number {
  if (!(attempt > 0)) return Math.min(baseMs, maxMs);
  return Math.min(maxMs, baseMs * 2 ** Math.min(attempt, 30));
}

/**
 * Starts the loop and returns its stop function. One check runs at a time:
 * the next is scheduled only after the previous settles. A check that throws
 * counts as a failed attempt and the loop carries on.
 */
export function startRecoveryPoll(
  check: () => void | Promise<void>,
  opts: RecoveryPollOptions,
): () => void {
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(run, recoveryDelay(attempt, opts.baseMs, opts.maxMs));
  };

  const run = async () => {
    timer = null;
    if (stopped) return;
    if (opts.isHidden?.()) {
      schedule();
      return;
    }
    attempt++;
    try {
      await check();
    } catch {
      // The screens' loaders handle their own errors; a throw here is one
      // more failed attempt, not a reason to give up recovering.
    }
    schedule();
  };

  schedule();
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

/** True on the transition from lost access back to access. */
export function accessRegained<T>(prev: T | null, next: T | null): boolean {
  return prev !== null && next === null;
}
