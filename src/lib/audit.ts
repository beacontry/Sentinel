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
  ENGINE_MODE_SWITCHED: "engine.mode_switched",
  ENGINE_LIVE_BLOCKED: "engine.live_blocked",
  // Orders
  ORDER_PLACED: "order.placed",
  ORDER_REJECTED: "order.rejected",
  ORDER_CANCELLED: "order.cancelled",
  // Risk
  RISK_PROFILE_UPDATED: "risk_profile.updated",
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];
