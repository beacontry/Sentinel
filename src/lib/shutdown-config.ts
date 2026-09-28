/**
 * Shutdown timing budget. Three numbers that must stay ordered, from the
 * inside out:
 *
 *   DRAIN_BUDGET_MS  <  FORCE_EXIT_MS  <  container stop grace
 *
 * - DRAIN_BUDGET_MS: how long the safety-stop drain (placeSafetyStops for
 *   every running engine) may spend on broker calls. Past it, no new broker
 *   call is started and the drain returns.
 * - FORCE_EXIT_MS: the SIGTERM handler's hard exit, derived from the drain
 *   budget so the drain always gets its full window first.
 * - The container grace (docker-compose.yml stop_grace_period, and
 *   `podman stop -t` in scripts/rotate-secrets.sh and the deploy workflow) is
 *   CONTAINER_STOP_GRACE_S. It must exceed FORCE_EXIT_MS, or the runtime's
 *   SIGKILL lands mid-drain and the force-exit never gets to run.
 *
 * tests/unit/shutdown-config.test.ts reads the Dockerfile and compose file and
 * fails when this ordering breaks.
 *
 * No imports: instrumentation.ts and the test load this without pulling in
 * the engine.
 */

/** Time the safety-stop drain may spend on broker calls. */
export const DRAIN_BUDGET_MS = 15_000;

/** Hard exit after SIGTERM. Drain budget plus headroom for logging and exit. */
export const FORCE_EXIT_MS = DRAIN_BUDGET_MS + 5_000;

/** Container stop grace in seconds (compose stop_grace_period, podman stop -t). */
export const CONTAINER_STOP_GRACE_S = 30;
