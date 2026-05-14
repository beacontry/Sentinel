// GET /api/public/watchlist/[token]
//
// Public read-only fetch by share token. No auth required. Returns
// the watchlist name + symbol list + owner display name (when one is
// set on the user). Empty/invalid token → 404.

import { NextResponse } from "next/server";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { watchlists, watchlistItems, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16 || token.length > 96) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  try {
    const result = await withTimeout(3000, async (tx) => {
      const [list] = await tx
        .select({
          id: watchlists.id,
          name: watchlists.name,
          createdAt: watchlists.createdAt,
          ownerId: watchlists.userId,
        })
        .from(watchlists)
        .where(eq(watchlists.shareToken, token))
        .limit(1);
      if (!list) return null;

      const items = await tx
        .select({ symbol: watchlistItems.symbol, addedAt: watchlistItems.addedAt })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, list.id))
        .orderBy(watchlistItems.addedAt);

      const [owner] = await tx
        .select({
          name: users.name,
          displayName: users.leaderboardDisplayName,
        })
        .from(users)
        .where(eq(users.id, list.ownerId))
        .limit(1);

      return {
        name: list.name,
        createdAt: list.createdAt,
        // Prefer the user's anonymous handle when they've set one — same
        // privacy preference they expressed for the leaderboard.
        ownerName: owner?.displayName ?? owner?.name ?? "A Beacontry user",
        symbols: items.map((i) => i.symbol),
      };
    });

    if (!result) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    return NextResponse.json(result, {
      // Public + cacheable for a few minutes — share targets don't change often
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
