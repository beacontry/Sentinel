import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { tradeJournal } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  createJournalSchema,
  updateJournalSchema,
  deleteJournalSchema,
} from "@/lib/validators";

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

    const entries = await db
      .select()
      .from(tradeJournal)
      .where(and(...conditions))
      .orderBy(desc(tradeJournal.createdAt))
      .limit(50);

    return NextResponse.json({
      entries: entries.map((e) => ({
        ...e,
        tags: Array.isArray(e.tags) ? e.tags : [],
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Journal list error:", message);
    return NextResponse.json({ error: "Failed to load journal" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  try {
    const [entry] = await db
      .insert(tradeJournal)
      .values({
        userId: session.userId,
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
    console.error("Journal create error:", message);
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    if (existing[0].userId !== session.userId) {
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
    console.error("Journal update error:", message);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    if (existing[0].userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db
      .delete(tradeJournal)
      .where(eq(tradeJournal.id, parsed.data.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Journal delete error:", message);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}
