/**
 * Process-wide shutdown state, owned by the SIGTERM/SIGINT handler in
 * instrumentation.ts.
 *
 * With NEXT_MANUAL_SIG_HANDLE=true nothing closes the HTTP server on SIGTERM,
 * so the old container keeps serving routes for the whole drain. A Start or
 * Switch in that window would run placeDisasterStops, whose cancel-all can be
 * cut off by the exit before the stops are re-placed. startEngine and the
 * order routes read isShuttingDown() and refuse (SHUTTING_DOWN, 503).
 *
 * runShutdownOnce keeps one drain per process. A second SIGTERM or a Ctrl-C
 * during the drain (a repeated `podman stop`) must wait for the drain in
 * progress, not start another whose `finally` exits and kills the first
 * part-way.
 *
 * No imports, like shutdown-config.ts: instrumentation.ts and the routes load
 * this without pulling in the engine.
 */

const g = globalThis as typeof globalThis & {
  __shuttingDown?: boolean;
  __shutdownDrain?: Promise<void>;
};

/** Stable error code for a request refused because the process is draining. */
export const SHUTTING_DOWN_CODE = "SHUTTING_DOWN";

/** Seconds a refused client should wait: the new container is up by then. */
export const SHUTTING_DOWN_RETRY_AFTER_S = 30;

export const SHUTTING_DOWN_MESSAGE =
  "The server is restarting. Try again in a moment; open positions keep their broker stops.";

/** True from the first shutdown signal until the process exits. */
export function isShuttingDown(): boolean {
  return g.__shuttingDown === true;
}

/**
 * Mark the process as shutting down and start `drain`, once. Later calls
 * return the drain already in progress. The flag is set synchronously, before
 * `drain` starts, so no request that arrives after the signal gets past a
 * guard.
 */
export function runShutdownOnce(drain: () => Promise<void>): { first: boolean; done: Promise<void> } {
  g.__shuttingDown = true;
  if (g.__shutdownDrain) return { first: false, done: g.__shutdownDrain };
  g.__shutdownDrain = drain();
  return { first: true, done: g.__shutdownDrain };
}

/** JSON body and init for a route refusing work during shutdown. */
export function shuttingDownResponseInit(): {
  body: { error: string; code: string; retryable: true };
  init: { status: 503; headers: Record<string, string> };
} {
  return {
    body: { error: SHUTTING_DOWN_MESSAGE, code: SHUTTING_DOWN_CODE, retryable: true },
    init: { status: 503, headers: { "Retry-After": String(SHUTTING_DOWN_RETRY_AFTER_S) } },
  };
}

/** Test hook: clear the process-wide state. */
export function resetShutdownStateForTests(): void {
  g.__shuttingDown = false;
  g.__shutdownDrain = undefined;
}
