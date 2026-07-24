/**
 * Append-only, hash-chained audit log.
 *
 * Writes serialize via pg_advisory_xact_lock(AUDIT_LOCK_KEY) so concurrent
 * callers can't fork the chain — each insert reads the current tail's hash,
 * computes the next hash, and inserts atomically inside the same tx.
 *
 * Canonical hash input (UTF-8, joined with a NUL byte that cannot occur in
 * any field):
 *   prevHash \0 createdAtISO \0 actorUserId \0 action \0 resourceType \0
 *   resourceId \0 canonicalJSON(metadata)
 *
 * GENESIS row uses prevHash = "GENESIS" (a literal sentinel — using "" would
 * collide with the empty-string field hash trivially).
 *
 * Schema: src/lib/db/schema/audit.ts
 * Migration: drizzle/0016_audit_log.sql
 */

import { createHash } from "crypto";
import { sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema/audit";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("audit");

/** PG advisory lock key (random 64-bit integer chosen once for this app). */
const AUDIT_LOCK_KEY = 8493920100;

/** Sentinel value for the very first row's prev_hash. */
export const GENESIS_PREV_HASH = "GENESIS";

export interface AuditWriteParams {
  actor: {
    userId: string | null;
    email?: string | null;
    role?: string | null;
  };
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Pass the incoming Request to capture IP + UA automatically. */
  request?: Request | null;
  /** Override IP/UA explicitly (e.g., for system-internal events). */
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditRow {
  id: number;
  createdAt: Date;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  prevHash: string;
  hash: string;
}

/**
 * Canonical-JSON: keys sorted alphabetically at every depth, no whitespace,
 * so equivalent objects always produce identical strings.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/** Compute the canonical hash for an audit row. */
export function computeHash(input: {
  prevHash: string;
  createdAt: Date;
  actorUserId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
}): string {
  const parts = [
    input.prevHash,
    input.createdAt.toISOString(),
    input.actorUserId ?? "",
    input.action,
    input.resourceType ?? "",
    input.resourceId ?? "",
    input.metadata == null ? "" : canonicalJSON(input.metadata),
  ];
  // NUL separator — cannot occur in any of these UTF-8 strings, so the
  // concatenation is unambiguous (no length-extension or field-confusion).
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

/** Extract first hop of X-Forwarded-For, falling back to other headers. */
export function extractIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return null;
}

/**
 * Append a row to the audit log. Returns the inserted row's id and hash on
 * success. Logs and returns null on failure — audit-write failures must NOT
 * cascade into request failures (we'd rather lose a log line than refuse a
 * legitimate trade). Persistent failures should trigger an alert.
 */
export async function writeAudit(params: AuditWriteParams): Promise<{ id: number; hash: string } | null> {
  const ip = params.ip ?? (params.request ? extractIp(params.request) : null);
  const userAgent =
    params.userAgent ?? (params.request ? params.request.headers.get("user-agent") : null);

  try {
    return await db.transaction(async (tx) => {
      // Serialize all audit writers — concurrent writers will queue here.
      // pg_advisory_xact_lock auto-releases on COMMIT/ROLLBACK.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`);

      const [tail] = await tx
        .select({ hash: auditLog.hash })
        .from(auditLog)
        .orderBy(desc(auditLog.id))
        .limit(1);

      const prevHash = tail?.hash ?? GENESIS_PREV_HASH;
      const createdAt = new Date();
      const hash = computeHash({
        prevHash,
        createdAt,
        actorUserId: params.actor.userId,
        action: params.action,
        resourceType: params.resourceType ?? null,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata ?? null,
      });

      const [row] = await tx
        .insert(auditLog)
        .values({
          createdAt,
          actorUserId: params.actor.userId,
          actorEmail: params.actor.email ?? null,
          actorRole: params.actor.role ?? null,
          action: params.action,
          resourceType: params.resourceType ?? null,
          resourceId: params.resourceId ?? null,
          ip,
          userAgent: userAgent ?? null,
          metadata: params.metadata ?? null,
          prevHash,
          hash,
        })
        .returning({ id: auditLog.id, hash: auditLog.hash });

      return { id: row.id, hash: row.hash };
    });
  } catch (err) {
    log.error(
      {
        err: err instanceof Error ? err.message : "unknown",
        action: params.action,
        actorUserId: params.actor.userId,
      },
      "Failed to write audit log entry"
    );
    return null;
  }
}

/**
 * Walk the audit log in id order, recompute each hash, and report the first
 * row that doesn't match (or doesn't link to its predecessor).
 *
 * Returns null if the chain is intact, or a description of the break.
 */
export async function verifyAuditChain(options?: { limit?: number }): Promise<
  | null
  | {
      brokenAtId: number;
      reason: "prev_hash_mismatch" | "hash_mismatch";
      expected: string;
      stored: string;
    }
> {
  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(auditLog.id)
    .limit(options?.limit ?? 100_000);

  let expectedPrev = GENESIS_PREV_HASH;
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return {
        brokenAtId: row.id,
        reason: "prev_hash_mismatch",
        expected: expectedPrev,
        stored: row.prevHash,
      };
    }
    const recomputed = computeHash({
      prevHash: row.prevHash,
      createdAt: row.createdAt,
      actorUserId: row.actorUserId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
    });
    if (recomputed !== row.hash) {
      return {
        brokenAtId: row.id,
        reason: "hash_mismatch",
        expected: recomputed,
        stored: row.hash,
      };
    }
    expectedPrev = row.hash;
  }
  return null;
}

/**
 * Action name registry — keeps callsites consistent. Add new actions here so
 * grep finds every place a given event is emitted.
 */
export const AuditAction = {
  // Auth
  AUTH_LOGIN_SUCCESS: "auth.login_success",
  AUTH_LOGIN_FAILED: "auth.login_failed",
  AUTH_LOGOUT: "auth.logout",
  AUTH_REGISTERED: "auth.user_registered",
  // Invites
  INVITE_SENT: "invite.sent",
  INVITE_CONSUMED: "invite.consumed",
  // Broker connections
  BROKER_CONNECTION_CREATED: "broker.connection.created",
  BROKER_CONNECTION_UPDATED: "broker.connection.updated",
  BROKER_CONNECTION_DELETED: "broker.connection.deleted",
  BROKER_CONNECTION_TESTED: "broker.connection.tested",
  // Engine lifecycle
  ENGINE_STARTED: "engine.started",
  ENGINE_STOPPED: "engine.stopped",
  ENGINE_HALTED: "engine.halted",
  // Automatic resume of a consecutive_losses halt within the same trading
  // day, triggered when SPY intraday drop exceeds the regime threshold AND
  // the halt cooled down past the minimum window. Distinguishes regime-
  // driven streaks ("the market dropped, my picks dropped with it") from
  // strategy failures ("my picks dropped while SPY was flat"). The cross-
  // day rollover clear (next-trading-day resume of streak halts) is a
  // separate path and does NOT write this event.
  ENGINE_HALT_AUTO_RESUMED: "engine.halt_auto_resumed",
  ENGINE_MODE_SWITCHED: "engine.mode_switched",
  ENGINE_LIVE_BLOCKED: "engine.live_blocked",
  ENGINE_PDT_VULNERABLE: "engine.pdt_vulnerable",
  ENGINE_ADMIN_OVERRIDE: "engine.admin_override",
  ENGINE_POSITION_DISAPPEARED: "engine.position_disappeared",
  // Broker position qty/basis changed with total cost conserved — a forward
  // or reverse stock split. The engine rescales entry/stop/TP/peak instead of
  // booking phantom P&L against the pre-split basis (the 2026-07-02 CRWD 4:1
  // incident: 5 shares @ $758.89 became 20 @ $189.72 and the stale stop
  // "realized" a fabricated −$2,829).
  ENGINE_POSITION_SPLIT_ADJUSTED: "engine.position_split_adjusted",
  // Wash-sale / losing-reentry blocked-set refresh has been failing for
  // longer than PROTECTION_REFRESH_ALERT_AFTER_MS. Fail-soft "keep previous
  // set" semantics silently degrade to NO protection when the failure starts
  // at boot (empty previous set) — the Jun 29–Jul 14 2026 incident where a
  // missing migration broke the refresh for 17 days with zero visibility.
  ENGINE_PROTECTION_DEGRADED: "engine.protection_degraded",
  // Container-boot autoStartIfNeeded exhausted all retries — engine will
  // not resume until the user manually restarts. Positions are orphaned
  // (no scans, no syncBrokerStops) until that happens. Audit so the next
  // incident leaves a hash-chained trace instead of being pino-only.
  ENGINE_AUTOSTART_FAILED: "engine.autostart_failed",
  // Engine tripped an auto-suppression for a symbol after N consecutive
  // PDT-rejected exit attempts. Position is still held but the engine
  // stops re-trying the sell (it was just generating broker noise + log
  // spam). User must manually flatten via the broker UI. Audit + push
  // notification so the condition reaches the user.
  ENGINE_EXIT_SUPPRESSED: "engine.exit_suppressed",
  // Orders
  ORDER_PLACED: "order.placed",
  ORDER_REJECTED: "order.rejected",
  ORDER_CANCELLED: "order.cancelled",
  // Risk
  RISK_PROFILE_UPDATED: "risk_profile.updated",
  // Account / user — used for ToS acceptance + future user-profile mutations
  USER_PROFILE_UPDATED: "user.profile_updated",
  // System configuration (admin) — set/rotate encrypted server-wide keys
  SYSTEM_CONFIG_UPDATED: "system_config.updated",
  // Reddit subreddit list (admin) — add/toggle/delete a sub that the
  // Reddit ticker-mention feed queries
  REDDIT_SUBREDDIT_UPDATED: "reddit_subreddit.updated",
  // User tier (subscription plan) changes — admin manual grants in
  // Phase 1, Stripe webhook in Phase 2. Always audit so we have a
  // hash-chained trail of every tier transition.
  USER_TIER_CHANGED: "user.tier_changed",
  // Stripe refund issued (via Stripe Dashboard → Customer → Refund).
  // Webhook charge.refunded fires → we log it so the audit trail has
  // every billing-affecting event in one place.
  BILLING_REFUNDED: "billing.refunded",
  // Stripe payment failed on renewal — we mark the user past_due so the
  // dashboard can surface a banner. Different from subscription.deleted,
  // which fires only after Stripe gives up retrying.
  BILLING_PAYMENT_FAILED: "billing.payment_failed",
  // Past-due banner cleared on successful renewal payment.
  BILLING_PAYMENT_RECOVERED: "billing.payment_recovered",
  // Auto-optimizer cron (2026-07-23) kicked off a scheduled GA run.
  OPTIMIZER_AUTO_RUN_STARTED: "optimizer.auto_run_started",
  // Auto-optimizer promoted a completed run's params to the global active
  // slot because its out-of-sample excess return beat the incumbent by the
  // configured margin. metadata carries candidateOOS/incumbentOOS/margin.
  OPTIMIZER_AUTO_PROMOTED: "optimizer.auto_promoted",
  // Auto-optimizer evaluated a completed run and kept the incumbent (candidate
  // did not clear the margin). Recorded so every autonomous decision — promote
  // AND reject — leaves a hash-chained trace.
  OPTIMIZER_AUTO_REJECTED: "optimizer.auto_rejected",
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];
