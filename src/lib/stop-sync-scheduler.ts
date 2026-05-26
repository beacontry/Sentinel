/**
 * Standalone broker-stop sync scheduler.
 *
 * Originally syncBrokerStops was called at the tail of every scan cycle
 * (runScan, runTacticalScan, runTacticalSmartScan). When the scan body
 * hung — e.g. tactical-smart's per-symbol Finnhub-paced analyzer loop
 * over 500+ screener-fed symbols — the call at the tail never executed,
 * so broker stops never updated for the entire session. The in-memory
 * 1-min runExitCheck poll kept happily promoting pos.stopLoss
 * (breakeven_only, dynamic trail), but the actual resting orders on
 * Alpaca stayed at engine-start values. Positions LOOKED protected on
 * the dashboard but weren't where the dashboard claimed.
 *
 * Incident: 2026-05-26 admin tactical-smart account. 6 positions
 * (INTC, IRM, ON, ROKU, SNDK, STX) drifted with in-memory stops
 * promoted via breakeven_only, broker side frozen at the disaster-stop
 * values placed at engine start (9 hours stale). Six 15-min scans
 * started, none completed, none reached syncBrokerStops.
 *
 * Fix: this scheduler. Runs every 5 minutes, independent of scan
 * health. For each engine, calls syncBrokerStopsForUser which gates
 * on engine.running, !halted, has-positions, and !scan-in-flight.
 * If the scan is healthy and racing to its own sync-tail, this skips.
 * If the scan is hung, this is the only thing that updates the broker.
 *
 * Mirrors the shape of engine-watchdog.ts intentionally — same lifecycle
 * pattern (start/stop, globalThis-tracked interval, instrumentation.ts
 * wiring) so anyone reading either file recognizes the other.
 */

import { getAllEngineSnapshots, syncBrokerStopsForUser } from "./trading-engine";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("stop-sync-scheduler");

/** Cadence. Tighter than the 15-min scan but looser than the 1-min exit
 *  poll. Five minutes is a tradeoff: a fresh ratchet from the in-memory
 *  breakeven_only promote at +2% reaches the broker within at most 5 min,
 *  but we don't generate 12× the replaceOrder calls per hour vs the
 *  per-scan cadence we used to have. */
const STOP_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const g = globalThis as typeof globalThis & {
  __stopSyncSchedulerId?: ReturnType<typeof setInterval>;
};

/**
 * One scheduler cycle. Iterates every engine on this process and asks
 * syncBrokerStopsForUser to do its thing. The helper already does the
 * health-gating; we just iterate + log a one-line summary.
 *
 * Exported for tests + for instrumentation.ts to fire one immediate run
 * at boot (so a freshly-deployed container catches up faster than
 * waiting 5 minutes for the first scheduled tick).
 */
export async function runStopSyncCycle(): Promise<void> {
  const snapshots = getAllEngineSnapshots();
  if (snapshots.length === 0) return;

  let ranCount = 0;
  const skipReasons: Record<string, number> = {};

  for (const s of snapshots) {
    try {
      const result = await syncBrokerStopsForUser(s.userId);
      if (result.ran) {
        ranCount++;
      } else if (result.reason) {
        skipReasons[result.reason] = (skipReasons[result.reason] ?? 0) + 1;
      }
    } catch (err) {
      // syncBrokerStopsForUser shouldn't throw (errors are swallowed
      // inside syncBrokerStops itself), but defense in depth: a thrown
      // error here would kill the whole cycle for the remaining users.
      log.warn(
        { userId: s.userId, err: err instanceof Error ? err.message : "unknown" },
        "Stop-sync cycle errored for user — continuing with next user"
      );
    }
  }

  if (ranCount > 0 || Object.keys(skipReasons).length > 0) {
    log.debug(
      { engines: snapshots.length, ran: ranCount, skipped: skipReasons },
      "Stop-sync cycle complete"
    );
  }
}

export function startStopSyncScheduler(): void {
  if (g.__stopSyncSchedulerId) return;
  g.__stopSyncSchedulerId = setInterval(() => {
    runStopSyncCycle().catch((err) => {
      log.error(
        { err: err instanceof Error ? err.message : "unknown" },
        "Stop-sync cycle failed"
      );
    });
  }, STOP_SYNC_INTERVAL_MS);
  log.info({ intervalMs: STOP_SYNC_INTERVAL_MS }, "Stop-sync scheduler started");
}

export function stopStopSyncScheduler(): void {
  if (g.__stopSyncSchedulerId) {
    clearInterval(g.__stopSyncSchedulerId);
    g.__stopSyncSchedulerId = undefined;
  }
}
