import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, withTimeout } from "@/lib/db";
import { optimizationRuns } from "@/lib/db/schema";
import { safeCompare } from "@/lib/crypto";
import { createRouteLogger } from "@/lib/logger";
import { getMarketDataProvider } from "@/lib/market-data";
import { writeAudit, AuditAction } from "@/lib/audit";
import { SP500_SYMBOLS, getSP500MembershipResolver } from "@/lib/sp500";
import type { Bar } from "@/types";
import {
  startOptimization,
  buildPortfolioData,
  portfolioBacktest,
  decidePromotion,
  TOP_50,
  TOP_150,
  type OptimizableParams,
  type OptimizationConfig,
} from "@/lib/optimizer";

export const dynamic = "force-dynamic";
// Documented budget: the evaluate tick re-fetches the run's universe and runs
// two holdout backtests (not the full GA — that's backgrounded to a worker).
// Prod is a long-lived self-hosted Node server (no serverless timeout); this is
// advisory for platform parity.
export const maxDuration = 300;

const log = createRouteLogger("cron-auto-optimize");

const g = globalThis as typeof globalThis & { __autoOptimizeCronRunning?: boolean };

/**
 * Autonomous GA optimizer scheduler (2026-07-23). Fully hands-off per product
 * decision: the cron kicks off a run, and on a later tick evaluates the winner
 * and PROMOTES it to the global active param slot iff its out-of-sample excess
 * return beats the incumbent by a margin. No human in the loop.
 *
 * Why a stateful state machine and not "run the GA here": a GA run is minutes of
 * CPU (~780 portfolio backtests) and is deliberately offloaded to a worker
 * thread — running it inline would block the whole Node process. So each cron
 * tick does exactly ONE unit of work, driven by DB state:
 *
 *   1. A run is in-flight (pending/fetching/optimizing)  → wait, return.
 *   2. A completed run hasn't been decided yet           → evaluate + promote/keep.
 *   3. Enough time has elapsed since the last run        → kick off a new GA.
 *   4. Otherwise                                         → idle.
 *
 * Idempotent + re-entrant: safe to call on any cadence (external scheduler, e.g.
 * every 30 min). The one-decision-per-completed-run guarantee comes from the
 * autoPromotionDecidedAt marker (migration 0048), so a completed run is never
 * re-scored (and the universe never re-fetched) on subsequent ticks.
 *
 * Auth: x-cron-secret vs CRON_SECRET (same as every other cron).
 *
 * Env config:
 *   OPTIMIZER_CRON_USER_ID       (required) service user that owns the runs
 *   OPTIMIZER_CRON_UNIVERSE      top50 | top150 | sp500        (default top50)
 *   OPTIMIZER_CRON_INTERVAL_HOURS min hours between run kickoffs (default 168 = weekly)
 *   OPTIMIZER_PROMOTE_MARGIN     OOS excess-return pp the candidate must win by (default 2)
 *   OPTIMIZER_CRON_POPULATION / _GENERATIONS / _TRAIN_PCT  GA knobs (defaults 30/25/60)
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || !safeCompare(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceUserId = process.env.OPTIMIZER_CRON_USER_ID;
  if (!serviceUserId) {
    log.error("OPTIMIZER_CRON_USER_ID not set — auto-optimizer disabled");
    return NextResponse.json(
      { status: "skipped", reason: "not_configured" },
      { status: 503 }
    );
  }

  // Single-process in-flight guard — an evaluate tick can take a while
  // (universe fetch + backtests); a second overlapping invocation must not
  // race the promote/decide write.
  if (g.__autoOptimizeCronRunning) {
    return NextResponse.json({ status: "skipped", reason: "already_running" });
  }
  g.__autoOptimizeCronRunning = true;
  try {
    // ── 1. Is a run already in flight for the service user? ──────────────
    const [latest] = await withTimeout(5000, (tx) =>
      tx
        .select({
          id: optimizationRuns.id,
          status: optimizationRuns.status,
          createdAt: optimizationRuns.createdAt,
        })
        .from(optimizationRuns)
        .where(eq(optimizationRuns.userId, serviceUserId))
        .orderBy(desc(optimizationRuns.createdAt))
        .limit(1)
    );

    if (
      latest &&
      (latest.status === "pending" ||
        latest.status === "fetching_data" ||
        latest.status === "optimizing")
    ) {
      return NextResponse.json({ status: "ok", phase: "running", runId: latest.id });
    }

    // ── 2. Any completed-but-undecided run to evaluate? ─────────────────
    const [pending] = await withTimeout(5000, (tx) =>
      tx
        .select({
          id: optimizationRuns.id,
          bestParams: optimizationRuns.bestParams,
          universe: optimizationRuns.universe,
          trainPct: optimizationRuns.trainPct,
        })
        .from(optimizationRuns)
        .where(
          and(
            eq(optimizationRuns.userId, serviceUserId),
            eq(optimizationRuns.status, "complete"),
            isNull(optimizationRuns.autoPromotionDecidedAt)
          )
        )
        .orderBy(desc(optimizationRuns.completedAt))
        .limit(1)
    );

    if (pending) {
      const outcome = await evaluateAndDecide(serviceUserId, pending);
      return NextResponse.json({ status: "ok", phase: "evaluated", ...outcome });
    }

    // ── 3. Time to kick off a new run? ──────────────────────────────────
    const intervalMs = envHours("OPTIMIZER_CRON_INTERVAL_HOURS", 168) * 3600_000;
    const lastAgeMs = latest ? Date.now() - new Date(latest.createdAt).getTime() : Infinity;
    if (lastAgeMs >= intervalMs) {
      const config: OptimizationConfig = {
        populationSize: envInt("OPTIMIZER_CRON_POPULATION", 30),
        generations: envInt("OPTIMIZER_CRON_GENERATIONS", 25),
        trainPct: envInt("OPTIMIZER_CRON_TRAIN_PCT", 60),
        universe: envUniverse(),
      };
      const runId = await startOptimization(serviceUserId, config);
      await writeAudit({
        actor: { userId: serviceUserId, email: null, role: "system" },
        action: AuditAction.OPTIMIZER_AUTO_RUN_STARTED,
        resourceType: "optimization_run",
        resourceId: runId,
        metadata: { ...config, trigger: "cron" },
      });
      log.info({ runId, config }, "Auto-optimizer kicked off a scheduled GA run");
      return NextResponse.json({ status: "ok", phase: "started", runId });
    }

    return NextResponse.json({
      status: "ok",
      phase: "idle",
      nextKickoffInMs: Math.max(0, intervalMs - lastAgeMs),
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Auto-optimizer tick failed");
    return NextResponse.json({ status: "error" }, { status: 500 });
  } finally {
    g.__autoOptimizeCronRunning = false;
  }
}

/**
 * Score the completed candidate against the current global active preset on a
 * shared out-of-sample holdout, and promote iff it clears the margin. Marks the
 * run decided either way so it's never re-evaluated. All heavy I/O (universe
 * fetch + 2 backtests) lives here; the promote/keep RULE is decidePromotion().
 */
async function evaluateAndDecide(
  serviceUserId: string,
  run: { id: string; bestParams: unknown; universe: string; trainPct: number }
): Promise<{ decision: string; candidateOOS: number | null; incumbentOOS: number | null }> {
  const margin = envFloat("OPTIMIZER_PROMOTE_MARGIN", 2);

  const candidateParams = asGaParams(run.bestParams);
  if (!candidateParams) {
    await markDecided(run.id);
    await auditReject(serviceUserId, run.id, "invalid_candidate_params", null, null, margin);
    log.warn({ runId: run.id }, "Auto-optimizer: completed run has no usable params — keeping incumbent");
    return { decision: "rejected", candidateOOS: null, incumbentOOS: null };
  }

  // Incumbent = the current GLOBAL active preset (one slot, not per-user).
  const [incumbent] = await withTimeout(5000, (tx) =>
    tx
      .select({ id: optimizationRuns.id, bestParams: optimizationRuns.bestParams })
      .from(optimizationRuns)
      .where(and(eq(optimizationRuns.status, "complete"), eq(optimizationRuns.isActive, true)))
      .limit(1)
  );

  // Already the active preset (nothing to compare against itself) — decide + done.
  if (incumbent && incumbent.id === run.id) {
    await markDecided(run.id);
    return { decision: "already_active", candidateOOS: null, incumbentOOS: null };
  }

  // Build ONE shared holdout on the candidate run's universe/split so both param
  // sets are scored apples-to-apples (stored per-run OOS numbers aren't
  // comparable — each run fetched its own data snapshot).
  const { universe, eligibleOn } = await resolveUniverse(run.universe);
  const allBars = new Map<string, Bar[]>();
  const provider = getMarketDataProvider();
  for (const sym of universe) {
    try {
      const bars = await Promise.race([
        provider.fetchBars(sym, 1825, "1d"),
        new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
      ]);
      if (bars.length > 200) allBars.set(sym, bars);
    } catch {
      /* skip unfetchable symbol */
    }
    await new Promise((r) => setTimeout(r, 1)); // yield
  }
  const data = buildPortfolioData(allBars, run.trainPct);

  const candidateOOS = portfolioBacktest(data, candidateParams, "test", eligibleOn).excessReturn;
  const incumbentParams = incumbent ? asGaParams(incumbent.bestParams) : null;
  const incumbentOOS = incumbentParams
    ? portfolioBacktest(data, incumbentParams, "test", eligibleOn).excessReturn
    : null;

  const decision = decidePromotion({ candidateOOS, incumbentOOS, margin });

  if (decision.promote) {
    // Flip the single global active slot — identical semantics to save-preset.
    await db.transaction(async (tx) => {
      await tx
        .update(optimizationRuns)
        .set({ isActive: false })
        .where(eq(optimizationRuns.isActive, true));
      await tx
        .update(optimizationRuns)
        .set({ isActive: true, autoPromotionDecidedAt: new Date() })
        .where(eq(optimizationRuns.id, run.id));
    });
    await writeAudit({
      actor: { userId: serviceUserId, email: null, role: "system" },
      action: AuditAction.OPTIMIZER_AUTO_PROMOTED,
      resourceType: "optimization_run",
      resourceId: run.id,
      metadata: {
        candidateOOS,
        incumbentOOS,
        margin,
        reason: decision.reason,
        universe: run.universe,
        demotedRunId: incumbent?.id ?? null,
      },
    });
    log.info(
      { runId: run.id, candidateOOS, incumbentOOS, margin, reason: decision.reason },
      "Auto-optimizer PROMOTED a new param set to the global active slot"
    );
    return { decision: "promoted", candidateOOS, incumbentOOS };
  }

  await markDecided(run.id);
  await auditReject(serviceUserId, run.id, decision.reason, candidateOOS, incumbentOOS, margin);
  log.info(
    { runId: run.id, candidateOOS, incumbentOOS, margin, reason: decision.reason },
    "Auto-optimizer kept the incumbent (candidate did not clear the margin)"
  );
  return { decision: "rejected", candidateOOS, incumbentOOS };
}

async function markDecided(runId: string): Promise<void> {
  await db
    .update(optimizationRuns)
    .set({ autoPromotionDecidedAt: new Date() })
    .where(eq(optimizationRuns.id, runId));
}

async function auditReject(
  serviceUserId: string,
  runId: string,
  reason: string,
  candidateOOS: number | null,
  incumbentOOS: number | null,
  margin: number
): Promise<void> {
  await writeAudit({
    actor: { userId: serviceUserId, email: null, role: "system" },
    action: AuditAction.OPTIMIZER_AUTO_REJECTED,
    resourceType: "optimization_run",
    resourceId: runId,
    metadata: { reason, candidateOOS, incumbentOOS, margin },
  });
}

/** Resolve the fetch universe + point-in-time membership gate (mirrors the
 *  mode-compare route so the holdout basis matches the Top Runs numbers). */
async function resolveUniverse(
  universe: string
): Promise<{ universe: string[]; eligibleOn?: (dateKey: string) => Set<string> }> {
  if (universe === "sp500") {
    const membership = await getSP500MembershipResolver().catch(() => null);
    if (membership) return { universe: membership.universe, eligibleOn: membership.eligibleOn };
    return { universe: SP500_SYMBOLS };
  }
  if (universe === "top150") return { universe: TOP_150 };
  return { universe: TOP_50 };
}

/** Validate a jsonb bestParams blob is a usable OptimizableParams. Old runs
 *  (pre-ATR take-profit) lack takeProfitAtrMult and can't be scored faithfully;
 *  those return null so the caller treats them as no-comparable-incumbent. */
function asGaParams(raw: unknown): OptimizableParams | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const keys: (keyof OptimizableParams)[] = [
    "stopLossPct", "takeProfitAtrMult", "trailingStopPct", "holdPeriod",
    "rsiOversold", "rsiOverbought", "emaFast", "emaSlow", "rsThreshold",
  ];
  for (const k of keys) {
    if (typeof p[k] !== "number" || !Number.isFinite(p[k])) return null;
  }
  return p as unknown as OptimizableParams;
}

function envUniverse(): OptimizationConfig["universe"] {
  const v = process.env.OPTIMIZER_CRON_UNIVERSE;
  return v === "top150" || v === "sp500" ? v : "top50";
}
function envInt(key: string, fallback: number): number {
  const n = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}
function envFloat(key: string, fallback: number): number {
  const n = parseFloat(process.env[key] ?? "");
  return Number.isFinite(n) ? n : fallback;
}
function envHours(key: string, fallback: number): number {
  const n = parseFloat(process.env[key] ?? "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
