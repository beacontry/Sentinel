/**
 * User subscription tiers — SERVER-ONLY helpers.
 *
 * Importing this module from a client component will break the
 * Next.js build because it transitively imports the Postgres driver
 * (which uses Node.js stdlib modules — `tls`, `fs`, `perf_hooks`,
 * etc. — that don't exist in the browser bundle).
 *
 * Client-safe pure functions (Tier type, TIERS array, userHasTier,
 * effectiveTier, labelFor, buildUpgradeRequiredPayload, isTier) live
 * in the sibling `tiers.ts`. Import client-safe stuff from there.
 *
 * Designed to compose with the existing `getSession()` /
 * `requireAuthWithCsrf()` flow rather than replace it. Two-line
 * addition per route after auth:
 *
 *   const auth = await requireAuthWithCsrf(request);
 *   if (auth instanceof Response) return auth;
 *   const tierFail = await checkTier(auth.userId, "trader");
 *   if (tierFail) return tierFail;
 *
 *   // ... rest of route logic
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, withTimeout } from "./db";
import { users } from "./db/schema/users";
import {
  buildUpgradeRequiredPayload,
  effectiveTier,
  userHasTier,
  type Tier,
} from "./tiers";

// Re-export the db handle so server callers can see we're using it
// without importing it separately. (Lints can flag dead imports, but
// this keeps the public surface explicit.)
export { db };

/**
 * Fetch a user's tier from the DB. Use sparingly — most callers
 * should rely on the tier already attached to the JWT session
 * (added at login). This is the fresh-from-DB fallback for routes
 * that need the absolute latest value (e.g., right after a tier
 * change).
 */
export async function getUserTier(userId: string): Promise<Tier> {
  try {
    const rows = await withTimeout(3000, async (tx) =>
      tx
        .select({ tier: users.tier, expires: users.tierExpiresAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    );
    if (rows.length === 0) return "free";
    return effectiveTier({ tier: rows[0].tier, tierExpiresAt: rows[0].expires });
  } catch {
    // DB failure — fail SAFE, not OPEN. Treat as 'free' so paid
    // features are denied during outages rather than silently allowed.
    return "free";
  }
}

/**
 * Validate that a user satisfies the minimum tier. Returns a 402
 * Response if not; null if the check passes (caller proceeds).
 *
 * Fail-safe: DB outages return 402 (effective tier defaults to
 * 'free' inside getUserTier on error). Better to deny a feature
 * during an outage than silently allow it.
 */
export async function checkTier(
  userId: string,
  minTier: Tier
): Promise<Response | null> {
  const currentTier = await getUserTier(userId);
  if (userHasTier(currentTier, minTier)) return null;
  return NextResponse.json(
    buildUpgradeRequiredPayload(currentTier, minTier),
    { status: 402 }
  );
}
