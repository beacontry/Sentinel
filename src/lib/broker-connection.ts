/**
 * The one resolver for "which broker connection is this user trading on".
 *
 * Every caller that acts on a user's broker account goes through
 * resolveActiveConnection: the engine resolvers (opening and protective),
 * manual orders (GET and POST), flatten, the account and dashboard reads.
 * Before this, the engine preferred the paper row while the order route and
 * flatten took `.limit(1)` with no ORDER BY, so with two active rows the
 * engine, the kill switch and a manual order could each act on a different
 * account.
 *
 * Migration 0049 makes one active connection per user a database invariant
 * (partial unique index ON (user_id) WHERE is_active). Migrations here are
 * applied by hand after deploy, so this resolver does not assume the index:
 * with several active rows it still picks deterministically, by the same rule
 * the migration uses to keep one (paper first, then the oldest, then id), and
 * logs that the invariant is broken.
 */

import { db } from "./db";
import { brokerConnections } from "./db/schema";
import { and, eq } from "drizzle-orm";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("broker-connection");

export type BrokerConnectionRow = typeof brokerConnections.$inferSelect;

/** Query executor: the pool, or a transaction from withTimeout(). */
type Executor = Pick<typeof db, "select">;

function createdAtMs(c: BrokerConnectionRow): number {
  const t = c.createdAt instanceof Date ? c.createdAt.getTime() : Date.parse(String(c.createdAt));
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/**
 * Pick the connection a user is trading on from their active rows (the
 * caller has already filtered on is_active). Paper is
 * preferred (the engine's historical rule, kept so nothing changes account on
 * deploy), then the oldest, then the lowest id. Pure; exported for tests.
 */
export function pickActiveConnection(rows: BrokerConnectionRow[]): BrokerConnectionRow | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const pa = a.environment === "paper" ? 0 : 1;
    const pb = b.environment === "paper" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ta = createdAtMs(a);
    const tb = createdAtMs(b);
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted[0];
}

/**
 * The user's active broker connection, or null when they have none. Scoped to
 * the user. Pass the transaction when called inside withTimeout().
 */
export async function resolveActiveConnection(
  userId: string,
  exec: Executor = db
): Promise<BrokerConnectionRow | null> {
  const rows: BrokerConnectionRow[] = await exec
    .select()
    .from(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.isActive, true)));

  const conn = pickActiveConnection(rows);
  if (conn && rows.length > 1) {
    log.warn(
      { userId, activeCount: rows.length, chosen: conn.id, environment: conn.environment },
      "Several active broker connections for one user; migration 0049 not applied? Using the paper-preferred one"
    );
  }
  return conn;
}
