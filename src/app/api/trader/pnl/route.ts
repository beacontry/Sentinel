import { NextRequest, NextResponse } from "next/server";
import { validateTraderSecret } from "@/lib/trader-auth";
import { traderPnlSchema } from "@/lib/trader-validators";
import { db } from "@/lib/db";
import { traderDailyPnl, traderStatus } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const authError = validateTraderSecret(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = traderPnlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Upsert by date
    const existing = await db
      .select()
      .from(traderDailyPnl)
      .where(eq(traderDailyPnl.date, parsed.data.date))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(traderDailyPnl)
        .set({
          realizedPnl: parsed.data.realized_pnl,
          unrealizedPnl: parsed.data.unrealized_pnl,
          tradesCount: parsed.data.trades_count,
          halted: parsed.data.halted,
        })
        .where(eq(traderDailyPnl.date, parsed.data.date));
    } else {
      await db.insert(traderDailyPnl).values({
        date: parsed.data.date,
        realizedPnl: parsed.data.realized_pnl,
        unrealizedPnl: parsed.data.unrealized_pnl,
        tradesCount: parsed.data.trades_count,
        halted: parsed.data.halted,
      });
    }

    // Update heartbeat
    const status = await db.select().from(traderStatus).limit(1);
    if (status.length > 0) {
      await db.update(traderStatus).set({ lastHeartbeat: new Date(), connected: true });
    } else {
      await db.insert(traderStatus).values({ connected: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Trader P&L error:", message);
    return NextResponse.json({ error: "Failed to store P&L" }, { status: 500 });
  }
}
