/**
 * User subscription tiers — single source of truth.
 *
 * Phase 1 of the billing rollout (2026-05-14). Enforcement only —
 * no payment integration yet. Admins grant tiers manually via the
 * /dashboard/admin UI; Stripe webhook will replace that path in
 * Phase 2.
 *
 * The four tiers and what they unlock:
 *
 *   free       — public-data only. Education hub, calculators,
 *                Congressional trades, Reddit feed, SEC filings,
 *                Yahoo daily bars, basic watchlist (1 list / 10
 *                symbols), read-only community.
 *   trader     — adds the engine, all Finnhub features (news,
 *                sentiment, fundamentals, options, insiders),
 *                multi-broker, full journal + tax center, GA
 *                optimizer, adaptive mode, audit log.
 *   premium    — adds AI features (chat, signal scoring, weekly
 *                review, daily digest) + future premium-data
 *                tier (L2, real-time SIP, dark pools).
 *   enterprise — team / firm / family-office. Same features as
 *                premium plus RBAC, dedicated tenant, custom data
 *                sources, SLA. Always granted manually.
 *
 * The hierarchy is strict and one-dimensional: enterprise > premium
 * > trader > free. A user at tier N has everything at tier ≤ N.
 *
 * DB-level CHECK constraint in migration 0035 enforces the enum at
 * the column level, so misspellings hit hard errors rather than
 * silently disabling gates.
 */

import { db, withTimeout } from "./db";
import { users } from "./db/schema/users";
import { eq } from "drizzle-orm";

export type Tier = "free" | "trader" | "premium" | "enterprise";

/**
 * Ordered list of tiers, lowest → highest. The index in this array
 * IS the tier rank — used by the comparator below.
 */
export const TIERS: readonly Tier[] = ["free", "trader", "premium", "enterprise"] as const;

/**
 * Numeric rank for a tier. Returns -1 for unknown strings so callers
 * can distinguish "unknown tier" (legacy data) from a valid low tier.
 */
export function tierRank(tier: string | null | undefined): number {
  if (!tier) return -1;
  return TIERS.indexOf(tier as Tier);
}

/**
 * Does `userTier` satisfy `requiredTier`? Strict comparison —
 * `userHasTier('trader', 'trader')` is true; `userHasTier('free',
 * 'trader')` is false. Unknown tiers always return false (fail-safe).
 */
export function userHasTier(
  userTier: string | null | undefined,
  requiredTier: Tier
): boolean {
  const userRank = tierRank(userTier);
  const requiredRank = tierRank(requiredTier);
  if (userRank < 0 || requiredRank < 0) return false;
  return userRank >= requiredRank;
}

/**
 * Resolve a user's current tier, accounting for `tier_expires_at`.
 * If a paid tier has expired (`tier_expires_at` is in the past) the
 * user effectively drops to 'free' regardless of what's in `tier`.
 *
 * This handles the post-cancellation grace period: a Stripe sub
 * gets canceled, we don't immediately flip tier='free' — we set
 * tier_expires_at to the end of the paid period. Until that moment,
 * userHasTier still returns the paid level.
 *
 * Returns 'free' for null/missing user (anonymous traffic).
 */
export function effectiveTier(user: {
  tier?: string | null;
  tierExpiresAt?: Date | null;
}): Tier {
  if (!user.tier) return "free";
  const raw = user.tier as Tier;
  if (!TIERS.includes(raw)) return "free"; // unknown → safe default
  // Expiry only applies to paid tiers. Free has no expiry concept;
  // enterprise is admin-granted and never expires through the cron.
  if (raw === "free" || raw === "enterprise") return raw;
  if (user.tierExpiresAt && user.tierExpiresAt.getTime() < Date.now()) {
    return "free";
  }
  return raw;
}

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
 * Returned by `requireTier()` when a user is below the required
 * tier. Shape matches the existing API Error Contract (code +
 * message + retryable + details) so the client can branch
 * uniformly on 402 responses.
 */
export interface UpgradeRequiredPayload {
  error: {
    code: "TIER_INSUFFICIENT";
    message: string;
    retryable: false;
    details: {
      currentTier: Tier;
      requiredTier: Tier;
      upgradeUrl: "/pricing";
    };
  };
}

export function buildUpgradeRequiredPayload(
  currentTier: Tier,
  requiredTier: Tier
): UpgradeRequiredPayload {
  return {
    error: {
      code: "TIER_INSUFFICIENT",
      message: `This feature requires the ${labelFor(requiredTier)} tier or higher. You're currently on ${labelFor(currentTier)}.`,
      retryable: false,
      details: {
        currentTier,
        requiredTier,
        upgradeUrl: "/pricing",
      },
    },
  };
}

/**
 * Pretty label for a tier (UI / error messages).
 */
export function labelFor(tier: Tier): string {
  switch (tier) {
    case "free": return "Free";
    case "trader": return "Trader";
    case "premium": return "Premium";
    case "enterprise": return "Enterprise";
  }
}

/**
 * Type guard — narrows a string to the Tier union.
 */
export function isTier(value: string): value is Tier {
  return TIERS.includes(value as Tier);
}

// ─── Request-level helpers ─────────────────────────────────────────────────
//
// Designed to compose with the existing `getSession()` /
// `requireAuthWithCsrf()` flow rather than replace it. Two-line addition
// per route after auth:
//
//   const auth = await requireAuthWithCsrf(request);
//   if (auth instanceof Response) return auth;
//   const tierFail = await checkTier(auth.userId, "trader");
//   if (tierFail) return tierFail;
//
//   // ... rest of route logic

import { NextResponse } from "next/server";

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
