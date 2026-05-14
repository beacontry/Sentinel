// GET  /api/watchlists  — list every watchlist this user owns
// POST /api/watchlists  — create a new named list (optionally with symbols)
//
// Default-invariant (exactly one isDefault per user) is enforced both by
// the DB partial unique index (`watchlists_user_default_uniq`) and by this
// route's create-with-setDefault transaction (demote prior default first).

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { watchlists, watchlistItems } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { createWatchlistSchema } from "@/lib/validators";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("watchlists");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          id: watchlists.id,
          name: watchlists.name,
          isDefault: watchlists.isDefault,
          createdAt: watchlists.createdAt,
          itemCount: sql<number>`(
            SELECT count(*)::int FROM watchlist_items
            WHERE watchlist_items.watchlist_id = watchlists.id
          )`,
        })
        .from(watchlists)
        .where(eq(watchlists.userId, session.userId))
        .orderBy(desc(watchlists.isDefault), desc(watchlists.createdAt));
    });

    return NextResponse.json(
      { watchlists: rows },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Watchlist list error");
    return NextResponse.json({ error: "Failed to load watchlists" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createWatchlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Default behaviour: a newly-created list does NOT become default unless
  // explicitly requested. Switching default is also possible via PATCH.
  const setDefault = parsed.data.setDefault === true;

  try {
    const result = await db.transaction(async (tx) => {
      // Cap at 20 lists/user — same shape as the layouts cap, keeps the
      // switcher UI usable.
      const existing = await tx
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(eq(watchlists.userId, auth.userId));
      if (existing.length >= 20) {
        throw new Error("LIMIT");
      }

      if (setDefault) {
        await tx
          .update(watchlists)
          .set({ isDefault: false })
          .where(
            and(
              eq(watchlists.userId, auth.userId),
              eq(watchlists.isDefault, true)
            )
          );
      }

      const [inserted] = await tx
        .insert(watchlists)
        .values({
          userId: auth.userId,
          name: parsed.data.name,
          isDefault: setDefault,
        })
        .returning({
          id: watchlists.id,
          name: watchlists.name,
          isDefault: watchlists.isDefault,
        });

      if (parsed.data.symbols.length > 0) {
        // Dedupe — the unique index would reject second copies anyway, but
        // sending duplicates to the DB and catching errors is wasteful.
        const uniqueSymbols = [...new Set(parsed.data.symbols)];
        await tx.insert(watchlistItems).values(
          uniqueSymbols.map((symbol) => ({
            userId: auth.userId,
            watchlistId: inserted.id,
            symbol,
          }))
        );
      }

      return inserted;
    });

    return NextResponse.json({ success: true, watchlist: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "LIMIT") {
      return NextResponse.json(
        { error: "Maximum 20 watchlists per user." },
        { status: 400 }
      );
    }
    log.error({ err: message }, "Watchlist create error");
    return NextResponse.json({ error: "Failed to create watchlist" }, { status: 500 });
  }
}
