import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { tradeJournal, portfolioTrades, portfolios, traderTrades } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  createJournalSchema,
  updateJournalSchema,
  deleteJournalSchema,
} from "@/lib/validators";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("journal");

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbolFilter = searchParams.get("symbol");
  const tagFilter = searchParams.get("tag");

  try {
    const conditions = [eq(tradeJournal.userId, session.userId)];

    if (symbolFilter) {
      conditions.push(eq(tradeJournal.symbol, symbolFilter.toUpperCase()));
    }

    if (tagFilter) {
      conditions.push(
        sql`${tradeJournal.tags}::jsonb @> ${JSON.stringify([tagFilter])}::jsonb`
      );
    }

    const entries = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(tradeJournal)
        .where(and(...conditions))
        .orderBy(desc(tradeJournal.createdAt))
        .limit(50);
    });

    return NextResponse.json({
      entries: entries.map((e) => ({
        ...e,
        tags: Array.isArray(e.tags) ? e.tags : [],
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Journal list error");
    return NextResponse.json({ error: "Failed to load journal" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createJournalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify the user owns any referenced trades — otherwise a journal entry
  // could be linked to another user's trade as a way to enumerate them.
  if (parsed.data.portfolioTradeId) {
    const [trade] = await db
      .select({ ownerId: portfolios.userId })
      .from(portfolioTrades)
      .innerJoin(portfolios, eq(portfolios.id, portfolioTrades.portfolioId))
      .where(eq(portfolioTrades.id, parsed.data.portfolioTradeId))
      .limit(1);
    if (!trade || trade.ownerId !== auth.userId) {
      return NextResponse.json({ error: "Invalid portfolio trade" }, { status: 403 });
    }
  }
  if (parsed.data.traderTradeId) {
    const [trade] = await db
      .select({ userId: traderTrades.userId })
      .from(traderTrades)
      .where(eq(traderTrades.id, parsed.data.traderTradeId))
      .limit(1);
    if (!trade || trade.userId !== auth.userId) {
      return NextResponse.json({ error: "Invalid trader trade" }, { status: 403 });
    }
  }

  try {
    const [entry] = await db
      .insert(tradeJournal)
      .values({
        userId: auth.userId,
        symbol: parsed.data.symbol,
        title: parsed.data.title,
        notes: parsed.data.notes,
        tags: parsed.data.tags,
        mood: parsed.data.mood ?? null,
        rating: parsed.data.rating ?? null,
        portfolioTradeId: parsed.data.portfolioTradeId ?? null,
        traderTradeId: parsed.data.traderTradeId ?? null,
      })
      .returning();

    return NextResponse.json(
      {
        entry: {
          ...entry,
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Journal create error");
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateJournalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Verify ownership
    const existing = await db
      .select({ userId: tradeJournal.userId })
      .from(tradeJournal)
      .where(eq(tradeJournal.id, parsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing[0].userId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
    if (parsed.data.mood !== undefined) updates.mood = parsed.data.mood;
    if (parsed.data.rating !== undefined) updates.rating = parsed.data.rating;

    const [updated] = await db
      .update(tradeJournal)
      .set(updates)
      .where(eq(tradeJournal.id, parsed.data.id))
      .returning();

    return NextResponse.json({
      entry: {
        ...updated,
        tags: Array.isArray(updated.tags) ? updated.tags : [],
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Journal update error");
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = deleteJournalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await db
      .select({ userId: tradeJournal.userId })
      .from(tradeJournal)
      .where(eq(tradeJournal.id, parsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing[0].userId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db
      .delete(tradeJournal)
      .where(eq(tradeJournal.id, parsed.data.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Journal delete error");
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}
