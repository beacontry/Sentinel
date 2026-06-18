/**
 * Engine watchdog — runs every 60s in the background, inspects every engine on
 * this process, and writes alerts to the engine_alerts table when conditions
 * fire. Severity 'error' alerts also send a push notification via the existing
 * PWA push subscription system.
 *
 * Conditions checked:
 *  - stall: engine should be running but lastScanAt is older than STALL_THRESHOLD_MS during market hours
 *  - broker_disconnect: brokerConnected=false (3+ consecutive failures already inside engine)
 *  - daily_loss_warn: realized daily loss is within 80% of the halt limit
 *  - exit_order_failed: a recent error mentions a failed sell/exit order
 *
 * Dedup: skips writing the same kind for the same user within 15 min, so a
 * persistent condition surfaces once per quarter-hour, not 15 times.
 */

import { db } from "./db";
import { engineAlerts } from "./db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { getAllEngineSnapshots, isMarketOpen } from "./trading-engine";
import { sendPushToUser } from "./push";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("engine-watchdog");

// Must be > the engine's scan cadence (SWING_SCAN_MS = 15 min in trading-engine.ts),
// or this fires every cycle. The overlap-guard can legitimately skip ONE tick when a
// scan runs long (~30 min gap that self-recovers), so set the threshold just past 2×
// the cadence: only two consecutive missed scans (a genuine stall) trips the alert.
const STALL_THRESHOLD_MS = 32 * 60 * 1000;
const DEDUP_WINDOW_MS = 15 * 60 * 1000;
const DAILY_LOSS_WARN_FRAC = 0.8;

type AlertKind = "stall" | "broker_disconnect" | "daily_loss_warn" | "exit_order_failed";
type AlertSeverity = "warn" | "error";

async function recentlyAlerted(userId: string, kind: AlertKind): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
  const [row] = await db
    .select({ id: engineAlerts.id })
    .from(engineAlerts)
    .where(and(
      eq(engineAlerts.userId, userId),
      eq(engineAlerts.kind, kind),
      gt(engineAlerts.createdAt, cutoff),
    ))
    .orderBy(desc(engineAlerts.createdAt))
    .limit(1);
  return Boolean(row);
}

async function writeAlert(args: {
  userId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(engineAlerts).values({
      userId: args.userId,
      kind: args.kind,
      severity: args.severity,
      message: args.message,
      context: args.context ?? {},
    });
    log.warn({ userId: args.userId, kind: args.kind, severity: args.severity }, args.message);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to write engine alert");
    return;
  }

  if (args.severity === "error") {
    try {
      await sendPushToUser(args.userId, {
        title: `Beacontry: ${args.kind.replace(/_/g, " ")}`,
        body: args.message,
        url: "/dashboard/trader",
      });
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Push notification failed");
    }
  }
}

export async function runWatchdog(): Promise<void> {
  // In-flight guard (audit #59): the 60s interval can fire again while a slow
  // cycle (many engines × awaited DB/push calls) is still running. Two
  // concurrent cycles both pass the recentlyAlerted dedup check before either
  // commits and double-write/double-push. Claim synchronously before any await.
  if (g.__engineWatchdogRunning) return;
  g.__engineWatchdogRunning = true;
  try {
  const snapshots = getAllEngineSnapshots();
  if (snapshots.length === 0) return;

  const marketOpen = isMarketOpen();
  const now = Date.now();

  for (const s of snapshots) {
    // 1. Stall detection — only meaningful during market hours and if engine claims to be running
    if (s.running && !s.halted && marketOpen && s.lastScanAt) {
      const ageMs = now - s.lastScanAt.getTime();
      if (ageMs > STALL_THRESHOLD_MS) {
        if (!(await recentlyAlerted(s.userId, "stall"))) {
          await writeAlert({
            userId: s.userId,
            kind: "stall",
            severity: "error",
            message: `Engine has not scanned in ${Math.round(ageMs / 60000)} min during market hours`,
            context: { ageMs, mode: s.mode, lastScanAt: s.lastScanAt.toISOString() },
          });
        }
      }
    }

    // 2. Broker disconnect — engine sets this flag after 5+ consecutive getPositions failures
    if (s.running && !s.brokerConnected) {
      if (!(await recentlyAlerted(s.userId, "broker_disconnect"))) {
        await writeAlert({
          userId: s.userId,
          kind: "broker_disconnect",
          severity: "error",
          message: `Broker unreachable (${s.consecutiveBrokerFailures} consecutive failures)`,
          context: { failures: s.consecutiveBrokerFailures, mode: s.mode },
        });
      }
    }

    // 3. Daily loss warning — fires at 80% of halt limit so the user can react
    //    before auto-halt. dailyLoss is negative when at a loss.
    //    dailyLossLimit is a fraction of equity; we don't have equity here so
    //    we approximate using the absolute loss magnitude vs the limit fraction
    //    of the user's typical book size. Skip if dailyLossLimit is 0/unset.
    if (s.running && !s.halted && s.dailyLossLimit > 0 && s.dailyLoss < 0) {
      // Treat dailyLoss in $ vs (dailyLossLimit * 100k) as a rough heuristic;
      // the engine itself uses equity at scan time so this watchdog warn is
      // intentionally conservative — anything within 20% of any plausible halt
      // line earns an alert.
      const lossMag = Math.abs(s.dailyLoss);
      // Default 2% of $50k = $1000; warn at 80% = $800. Use the engine's known
      // limit fraction × a conservative $50k floor to avoid double-alerting on
      // tiny accounts.
      const conservativeHaltDollars = s.dailyLossLimit * 50_000;
      if (lossMag >= DAILY_LOSS_WARN_FRAC * conservativeHaltDollars) {
        if (!(await recentlyAlerted(s.userId, "daily_loss_warn"))) {
          await writeAlert({
            userId: s.userId,
            kind: "daily_loss_warn",
            severity: "warn",
            message: `Daily loss approaching halt limit ($${lossMag.toFixed(2)})`,
            context: { dailyLoss: s.dailyLoss, dailyLossLimit: s.dailyLossLimit },
          });
        }
      }
    }

    // 4. Recent exit-order failures — engine pushes to errors[] when sells fail
    const exitFailure = s.recentErrors.find(e => /sell order failed|exit order failed/i.test(e));
    if (exitFailure) {
      if (!(await recentlyAlerted(s.userId, "exit_order_failed"))) {
        await writeAlert({
          userId: s.userId,
          kind: "exit_order_failed",
          severity: "error",
          message: exitFailure,
          context: { mode: s.mode },
        });
      }
    }
  }
  } finally {
    g.__engineWatchdogRunning = false;
  }
}

const g = globalThis as typeof globalThis & {
  __engineWatchdogId?: ReturnType<typeof setInterval>;
  __engineWatchdogRunning?: boolean;
};

const WATCHDOG_INTERVAL_MS = 60 * 1000;

export function startWatchdog(): void {
  if (g.__engineWatchdogId) return;
  g.__engineWatchdogId = setInterval(() => {
    runWatchdog().catch((err) => {
      log.error({ err: err instanceof Error ? err.message : "unknown" }, "Watchdog cycle failed");
    });
  }, WATCHDOG_INTERVAL_MS);
  log.info({ intervalMs: WATCHDOG_INTERVAL_MS }, "Engine watchdog started");
}

export function stopWatchdog(): void {
  if (g.__engineWatchdogId) {
    clearInterval(g.__engineWatchdogId);
    g.__engineWatchdogId = undefined;
  }
}
