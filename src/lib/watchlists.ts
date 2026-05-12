// Phase A — multi-watchlist helpers. Shared between every consumer that
// needs to read or write a watchlist so the "default list" lookup logic
// lives in exactly one place.
//
// Two functions cover all the call sites:
//   - getOrCreateDefaultWatchlistId(userId)  : guarantee a default exists, return its id
//   - resolveActiveWatchlistId(userId, hint?) : resolve "the list to use right now" with
//                                               a caller-supplied override
//
// Callers that mutate (POST/DELETE on /api/watchlist, page-level adds)
// should use getOrCreateDefaultWatchlistId. Read-only callers that show
// the user's "primary" symbols (widgets, sentiment, earnings, etc.)
// should use resolveActiveWatchlistId(userId) — null means "no list yet,
// treat as empty."

import { db } from "@/lib/db";
import { watchlists } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Return the user's default watchlist id, creating one ("Default") if they
 * don't have one yet. Idempotent under concurrent calls because the unique
 * partial index `watchlists_user_default_uniq` enforces one-default-per-user
 * at the DB layer — the second concurrent insert ends up rejected and we
 * re-select.
 */
export async function getOrCreateDefaultWatchlistId(userId: string): Promise<string> {
  // Fast path: existing default.
  const [existing] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(
      and(eq(watchlists.userId, userId), eq(watchlists.isDefault, true))
    )
    .limit(1);
  if (existing) return existing.id;

  // Slow path: create. The partial unique index guarantees there can only
  // be one default per user, so if two requests race, the second insert
  // raises a unique-violation and we fall through to a second SELECT.
  try {
    const [inserted] = await db
      .insert(watchlists)
      .values({
        userId,
        name: "Default",
        isDefault: true,
      })
      .returning({ id: watchlists.id });
    if (inserted) return inserted.id;
  } catch {
    // Race lost — another concurrent caller already created the default.
    // Fall through to the second select.
  }

  const [second] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(
      and(eq(watchlists.userId, userId), eq(watchlists.isDefault, true))
    )
    .limit(1);
  if (second) return second.id;

  // We tried, somebody won, and yet nothing is there. This is genuinely
  // surprising — surface it loudly rather than silently inserting orphans.
  throw new Error(`Failed to resolve default watchlist for user ${userId}`);
}

/**
 * Resolve the watchlist id the caller should use for a read. If `hint` is
 * provided and the watchlist exists + belongs to this user, return it.
 * Otherwise fall back to the user's default. Returns null when the user
 * has no watchlists at all (caller should treat as empty list).
 */
export async function resolveActiveWatchlistId(
  userId: string,
  hint?: string | null
): Promise<string | null> {
  if (hint) {
    const [match] = await db
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(and(eq(watchlists.userId, userId), eq(watchlists.id, hint)))
      .limit(1);
    if (match) return match.id;
    // Hint pointed to a non-existent / not-owned list — silently fall back
    // to default rather than 404. Callers that need strict behaviour can
    // re-validate the id themselves.
  }

  const [def] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(and(eq(watchlists.userId, userId), eq(watchlists.isDefault, true)))
    .limit(1);
  return def?.id ?? null;
}
