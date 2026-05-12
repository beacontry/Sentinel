// POST   /api/watchlists/[id]/items  — add a symbol to a specific list
// DELETE /api/watchlists/[id]/items  — remove a symbol from a specific list
//
// Per-list mutation. The legacy /api/watchlist endpoint still works for
// the "act on my default list" case; these routes are for the Watchlists
// page and the analysis-page switcher where the list is explicit.

import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { watchlists, watchlistItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { addSymbolSchema, removeSymbolSchema } from "@/lib/validators";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("watchlist-items");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertOwnedList(userId: string, listId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(and(eq(watchlists.id, listId), eq(watchlists.userId, userId)))
    .limit(1);
  return !!row;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 });
  }

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

  if (!(await assertOwnedList(auth.userId, id))) {
    return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
  }

  try {
    await db
      .insert(watchlistItems)
      .values({
        userId: auth.userId,
        watchlistId: id,
        symbol: parsed.data.symbol,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, watchlistId: id }, "Watchlist item add error");
    return NextResponse.json({ error: "Failed to add symbol" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 });
  }

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

  if (!(await assertOwnedList(auth.userId, id))) {
    return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
  }

  try {
    await db
      .delete(watchlistItems)
      .where(
        and(
          eq(watchlistItems.watchlistId, id),
          eq(watchlistItems.symbol, parsed.data.symbol.toUpperCase())
        )
      );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, watchlistId: id }, "Watchlist item delete error");
    return NextResponse.json({ error: "Failed to remove symbol" }, { status: 500 });
  }
}
