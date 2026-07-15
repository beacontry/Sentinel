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
import { engineAlerts, traderStatus } from "./db/schema";
import { and, desc, eq, gt, lt } from "drizzle-orm";
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
// Zombie trader_status sweep: rows claiming connected=true whose heartbeat is
// older than this are dead engines from a previous process (container
// restart, crashed boot) — the cc7d3dfc row sat connected=true with a 35-day
// stale heartbeat, skewing every dashboard/aggregate that trusts the flag.
const STALE_STATUS_MS = 24 * 60 * 60 * 1000;
const ZOMBIE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Milliseconds elapsed since today's 9:30 ET session open. Pure given a
 * timestamp; negative before the open. Used to clamp the stall clock: a
 * lastScanAt from Friday afternoon read Monday 9:35 is ~65h old, but the
 * engine has only had 5 minutes of market time to scan — the pre-clamp
 * watchdog fired "not scanned in 3,942 min" every Monday open (weekend gap
 * false positive).
 */
export function msSinceSessionOpen(nowMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour * 60 + minute - (9 * 60 + 30)) * 60 * 1000;
}

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
  const now = Date.now();

  // 0. Zombie trader_status sweep (hourly). Rows claiming connected=true with
  //    a heartbeat older than STALE_STATUS_MS belong to engines from a dead
  //    process — mark them disconnected so dashboards and aggregates stop
  //    counting them. Engines alive in THIS process are exempt (they'd
  //    re-heartbeat anyway, but don't race them). Runs before the empty-
  //    snapshot early-return: a process with zero engines still reaps.
  if (now - (g.__lastZombieSweepAt ?? 0) > ZOMBIE_SWEEP_INTERVAL_MS) {
    g.__lastZombieSweepAt = now;
    try {
      const cutoff = new Date(now - STALE_STATUS_MS);
      const inMemory = new Set(snapshots.map((s) => s.userId));
      const staleRows = await db
        .select({ userId: traderStatus.userId, lastHeartbeat: traderStatus.lastHeartbeat })
        .from(traderStatus)
        .where(and(eq(traderStatus.connected, true), lt(traderStatus.lastHeartbeat, cutoff)));
      for (const row of staleRows) {
        if (!row.userId || inMemory.has(row.userId)) continue;
        await db
          .update(traderStatus)
          .set({ connected: false })
          .where(eq(traderStatus.userId, row.userId));
        log.warn(
          { userId: row.userId, lastHeartbeat: row.lastHeartbeat?.toISOString() },
          "Zombie trader_status reaped — connected=true with stale heartbeat, no engine in memory"
        );
      }
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : "unknown" }, "Zombie trader_status sweep failed");
    }
  }

  if (snapshots.length === 0) return;

  const marketOpen = isMarketOpen();

  for (const s of snapshots) {
    // 1. Stall detection — only meaningful during market hours and if engine claims to be running.
    //    The stall clock is clamped to time-since-session-open: a Friday-
    //    afternoon lastScanAt read Monday 9:35 is 65h stale on the wall clock
    //    but the engine has only had 5 min of MARKET time — pre-clamp, every
    //    Monday open fired a "not scanned in 3,942 min" false positive.
    if (s.running && !s.halted && marketOpen && s.lastScanAt) {
      const ageMs = Math.min(now - s.lastScanAt.getTime(), msSinceSessionOpen(now));
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

    // 3. Daily loss warning — fires at 80% of the REAL halt line
    //    (dailyLossLimit × boot equity) so it scales with account size
    //    (audit #61). The old fixed $50k basis warned a $500k book on nearly
    //    every losing day and never warned a $5k book before the engine's own
    //    halt. Skip when equity is unknown rather than fabricate one.
    if (
      s.running && !s.halted && s.dailyLossLimit > 0 && s.dailyLoss < 0 &&
      s.bootEquity != null && s.bootEquity > 0
    ) {
      const lossMag = Math.abs(s.dailyLoss);
      const haltDollars = s.dailyLossLimit * s.bootEquity;
      if (lossMag >= DAILY_LOSS_WARN_FRAC * haltDollars) {
        if (!(await recentlyAlerted(s.userId, "daily_loss_warn"))) {
          await writeAlert({
            userId: s.userId,
            kind: "daily_loss_warn",
            severity: "warn",
            message: `Daily loss approaching halt limit ($${lossMag.toFixed(2)} of $${haltDollars.toFixed(0)})`,
            context: { dailyLoss: s.dailyLoss, dailyLossLimit: s.dailyLossLimit, haltDollars },
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
  __lastZombieSweepAt?: number;
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
