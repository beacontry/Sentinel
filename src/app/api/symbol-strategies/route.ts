import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { symbolStrategies } from "@/lib/db/schema";
import { createSymbolStrategySchema, deleteSymbolStrategySchema } from "@/lib/validators";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(symbolStrategies)
        .where(eq(symbolStrategies.userId, session.userId))
        .orderBy(symbolStrategies.symbol);
    });

    return NextResponse.json({ strategies: rows });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    return NextResponse.json({ error: "Failed to load strategies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const parsed = createSymbolStrategySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Upsert: update if symbol already assigned, insert otherwise
  const existing = await db
    .select()
    .from(symbolStrategies)
    .where(
      and(
        eq(symbolStrategies.userId, auth.userId),
        eq(symbolStrategies.symbol, data.symbol)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(symbolStrategies)
      .set({
        presetName: data.presetName ?? null,
        stopLossPct: data.stopLossPct,
        takeProfitPct: data.takeProfitPct,
        trailingStopPct: data.trailingStopPct,
        holdPeriod: data.holdPeriod,
        atrTuned: data.atrTuned,
        lastAtr: data.lastAtr ?? null,
        notes: data.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(symbolStrategies.id, existing[0].id))
      .returning();

    return NextResponse.json({ strategy: updated });
  }

  const [created] = await db
    .insert(symbolStrategies)
    .values({
      userId: auth.userId,
      symbol: data.symbol,
      presetName: data.presetName ?? null,
      stopLossPct: data.stopLossPct,
      takeProfitPct: data.takeProfitPct,
      trailingStopPct: data.trailingStopPct,
      holdPeriod: data.holdPeriod,
      atrTuned: data.atrTuned,
      lastAtr: data.lastAtr ?? null,
      notes: data.notes ?? null,
    })
    .returning();

  return NextResponse.json({ strategy: created }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const parsed = deleteSymbolStrategySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(symbolStrategies)
    .where(
      and(
        eq(symbolStrategies.id, parsed.data.id),
        eq(symbolStrategies.userId, auth.userId)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(symbolStrategies).where(eq(symbolStrategies.id, parsed.data.id));
  return NextResponse.json({ success: true });
}
