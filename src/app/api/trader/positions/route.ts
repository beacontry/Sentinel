import { NextRequest, NextResponse } from "next/server";
import { validateTraderSecret } from "@/lib/trader-auth";
import { traderPositionsSchema } from "@/lib/trader-validators";
import { db } from "@/lib/db";
import { traderPositions, traderStatus } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  const authError = validateTraderSecret(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = traderPositionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Full snapshot replace: delete all then insert
    await db.delete(traderPositions);

    if (parsed.data.positions.length > 0) {
      await db.insert(traderPositions).values(
        parsed.data.positions.map((p) => ({
          symbol: p.symbol.toUpperCase(),
          quantity: p.quantity,
          entryPrice: p.entry_price,
          currentPrice: p.current_price,
          unrealizedPnl: p.unrealized_pnl,
          stopPrice: p.stop_price ?? null,
        }))
      );
    }

    // Update heartbeat
    const status = await db.select().from(traderStatus).limit(1);
    if (status.length > 0) {
      await db.update(traderStatus).set({ lastHeartbeat: new Date(), connected: true });
    } else {
      await db.insert(traderStatus).values({ connected: true });
    }

    return NextResponse.json({ received: true, count: parsed.data.positions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Trader positions error:", message);
    return NextResponse.json({ error: "Failed to store positions" }, { status: 500 });
  }
}
