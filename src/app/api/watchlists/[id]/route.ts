// GET    /api/watchlists/[id]         — fetch a list (metadata + symbols)
// PATCH  /api/watchlists/[id]         — rename / setDefault
// DELETE /api/watchlists/[id]         — delete (auto-promotes oldest remaining to default)
//
// Deleting the user's only list is rejected — every user must have at
// least one watchlist after their first interaction with the system, so
// the various downstream consumers (widgets, news feed, alerts, etc.)
// can always resolve "the user's symbols."

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { watchlists, watchlistItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { renameWatchlistSchema } from "@/lib/validators";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("watchlist-detail");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 });
  }

  try {
    const result = await withTimeout(3000, async (tx) => {
      const [meta] = await tx
        .select({
          id: watchlists.id,
          name: watchlists.name,
          isDefault: watchlists.isDefault,
          createdAt: watchlists.createdAt,
        })
        .from(watchlists)
        .where(
          and(eq(watchlists.id, id), eq(watchlists.userId, session.userId))
        )
        .limit(1);
      if (!meta) return null;

      const items = await tx
        .select({ symbol: watchlistItems.symbol })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, id))
        .orderBy(watchlistItems.addedAt);

      return { ...meta, symbols: items.map((i) => i.symbol) };
    });

    if (!result) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, watchlistId: id }, "Watchlist fetch error");
    return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let nextName: string | undefined;
  if ("name" in body) {
    const parsed = renameWatchlistSchema.safeParse({ name: body.name });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    nextName = parsed.data.name;
  }

  const setDefault = body.setDefault === true;

  if (nextName === undefined && !setDefault) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: watchlists.id, isDefault: watchlists.isDefault })
        .from(watchlists)
        .where(
          and(eq(watchlists.id, id), eq(watchlists.userId, auth.userId))
        )
        .limit(1);
      if (!target) throw new Error("NOT_FOUND");

      if (setDefault && !target.isDefault) {
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

      const updates: Record<string, unknown> = {};
      if (nextName !== undefined) updates.name = nextName;
      if (setDefault) updates.isDefault = true;

      const [updated] = await tx
        .update(watchlists)
        .set(updates)
        .where(eq(watchlists.id, id))
        .returning({
          id: watchlists.id,
          name: watchlists.name,
          isDefault: watchlists.isDefault,
        });
      return updated;
    });

    return NextResponse.json({ success: true, watchlist: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    log.error({ err: message, watchlistId: id }, "Watchlist update error");
    return NextResponse.json({ error: "Failed to update watchlist" }, { status: 500 });
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

  try {
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: watchlists.id, isDefault: watchlists.isDefault })
        .from(watchlists)
        .where(
          and(eq(watchlists.id, id), eq(watchlists.userId, auth.userId))
        )
        .limit(1);
      if (!target) throw new Error("NOT_FOUND");

      // Refuse to delete the user's last watchlist — every consumer assumes
      // the user has at least one list once they've used the feature, and
      // recreating a "Default" implicitly on POST is confusing.
      const allLists = await tx
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(eq(watchlists.userId, auth.userId));
      if (allLists.length <= 1) {
        throw new Error("LAST");
      }

      await tx.delete(watchlists).where(eq(watchlists.id, id));

      // If we deleted the default, promote the next-oldest survivor.
      if (target.isDefault) {
        const [next] = await tx
          .select({ id: watchlists.id })
          .from(watchlists)
          .where(eq(watchlists.userId, auth.userId))
          .orderBy(watchlists.createdAt)
          .limit(1);
        if (next) {
          await tx
            .update(watchlists)
            .set({ isDefault: true })
            .where(eq(watchlists.id, next.id));
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    if (message === "LAST") {
      return NextResponse.json(
        { error: "Cannot delete your only watchlist." },
        { status: 400 }
      );
    }
    log.error({ err: message, watchlistId: id }, "Watchlist delete error");
    return NextResponse.json({ error: "Failed to delete watchlist" }, { status: 500 });
  }
}
