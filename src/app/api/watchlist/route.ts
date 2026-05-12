// Legacy single-watchlist endpoint. After Phase A.1 introduces multiple
// named watchlists per user, this route remains the "your primary list"
// surface — every existing caller (widgets, page loads, /dashboard/analysis
// reads, Discord webhook targeting) keeps working because GET returns the
// default list's symbols and POST/DELETE operate on the default list.
//
// New code that needs to scope to a specific list should use:
//   GET    /api/watchlists/[id]/items
//   POST   /api/watchlists/[id]/items
//   DELETE /api/watchlists/[id]/items
//
// Or pass `?watchlistId=…` to this route (POST/DELETE) — it'll be respected
// when present and owned by the caller, ignored otherwise.

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { watchlistItems, watchlists } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { addSymbolSchema, removeSymbolSchema } from "@/lib/validators";
import {
  getOrCreateDefaultWatchlistId,
  resolveActiveWatchlistId,
} from "@/lib/watchlists";

const log = createRouteLogger("watchlist");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const activeId = await resolveActiveWatchlistId(session.userId);
    if (!activeId) {
      // No watchlists at all — return empty so the UI shows the empty state.
      return NextResponse.json({ symbols: [], watchlistId: null });
    }

    const items = await withTimeout(3000, async (tx) => {
      return tx
        .select({ symbol: watchlistItems.symbol })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, activeId))
        .orderBy(watchlistItems.addedAt);
    });

    return NextResponse.json({
      symbols: items.map((i) => i.symbol),
      watchlistId: activeId,
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Watchlist load error");
    return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = addSymbolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Allow ?watchlistId= override (POST body or query). Default-list resolver
  // creates a Default list if the user is brand-new and never used the API.
  const url = new URL(request.url);
  const requested =
    url.searchParams.get("watchlistId") ??
    (body as { watchlistId?: string })?.watchlistId ??
    null;

  try {
    let targetId: string;
    if (requested) {
      const resolved = await resolveActiveWatchlistId(auth.userId, requested);
      if (!resolved) {
        return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
      }
      targetId = resolved;
    } else {
      targetId = await getOrCreateDefaultWatchlistId(auth.userId);
    }

    await db
      .insert(watchlistItems)
      .values({
        userId: auth.userId,
        watchlistId: targetId,
        symbol: parsed.data.symbol,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true, watchlistId: targetId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Watchlist add error");
    return NextResponse.json({ error: "Failed to add symbol" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = removeSymbolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const url = new URL(request.url);
  const requested =
    url.searchParams.get("watchlistId") ??
    (body as { watchlistId?: string })?.watchlistId ??
    null;

  try {
    const targetId = await resolveActiveWatchlistId(auth.userId, requested);
    if (!targetId) {
      // No watchlists exist — there's nothing to delete. 200 instead of 404
      // so the client's optimistic remove doesn't reverse-revert on success.
      return NextResponse.json({ success: true });
    }

    await db
      .delete(watchlistItems)
      .where(
        and(
          eq(watchlistItems.watchlistId, targetId),
          eq(watchlistItems.symbol, parsed.data.symbol.toUpperCase())
        )
      );

    return NextResponse.json({ success: true, watchlistId: targetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Watchlist delete error");
    return NextResponse.json({ error: "Failed to remove symbol" }, { status: 500 });
  }
}

// Keep watchlists import alive for tree-shaking detection during builds
// (the resolveActiveWatchlistId helper references it).
void watchlists;
