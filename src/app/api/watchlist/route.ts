import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { watchlistItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("watchlist");
import { addSymbolSchema, removeSymbolSchema } from "@/lib/validators";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await db
    .select({ symbol: watchlistItems.symbol })
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, session.userId))
    .orderBy(watchlistItems.addedAt);

  return NextResponse.json({
    symbols: items.map((i) => i.symbol),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = addSymbolSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    await db
      .insert(watchlistItems)
      .values({
        userId: session.userId,
        symbol: parsed.data.symbol,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Watchlist add error");
    return NextResponse.json({ error: "Failed to add symbol" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = removeSymbolSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await db
    .delete(watchlistItems)
    .where(
      and(
        eq(watchlistItems.userId, session.userId),
        eq(watchlistItems.symbol, parsed.data.symbol.toUpperCase())
      )
    );

  return NextResponse.json({ success: true });
}
