import { NextRequest, NextResponse } from "next/server";
import { validateTraderSecret } from "@/lib/trader-auth";
import { traderTradeSchema, traderTradeUpdateSchema } from "@/lib/trader-validators";
import { db } from "@/lib/db";
import { traderTrades, traderStatus } from "@/lib/db/schema";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("trader-trades");
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const authError = validateTraderSecret(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = traderTradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [row] = await db
      .insert(traderTrades)
      .values({
        traderId: parsed.data.trader_id,
        symbol: parsed.data.symbol.toUpperCase(),
        signal: parsed.data.signal,
        action: parsed.data.action,
        quantity: parsed.data.quantity,
        orderType: parsed.data.order_type,
        limitPrice: parsed.data.limit_price ?? null,
        stopPrice: parsed.data.stop_price ?? null,
        notes: parsed.data.notes ?? null,
        traderTimestamp: new Date(parsed.data.timestamp),
      })
      .returning({ id: traderTrades.id });

    await upsertHeartbeat();

    return NextResponse.json({ id: row.id, received: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Trader trade error");
    return NextResponse.json({ error: "Failed to store trade" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authError = validateTraderSecret(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = traderTradeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updates: Record<string, unknown> = { status: parsed.data.status };
    if (parsed.data.fill_price != null) updates.fillPrice = parsed.data.fill_price;
    if (parsed.data.fill_time) updates.fillTime = new Date(parsed.data.fill_time);
    if (parsed.data.pnl != null) updates.pnl = parsed.data.pnl;

    await db
      .update(traderTrades)
      .set(updates)
      .where(eq(traderTrades.traderId, parsed.data.trader_id));

    await upsertHeartbeat();

    return NextResponse.json({ updated: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Trader trade update error");
    return NextResponse.json({ error: "Failed to update trade" }, { status: 500 });
  }
}

async function upsertHeartbeat() {
  try {
    const existing = await db.select().from(traderStatus).limit(1);
    if (existing.length > 0) {
      await db.update(traderStatus).set({ lastHeartbeat: new Date(), connected: true });
    } else {
      await db.insert(traderStatus).values({ connected: true });
    }
  } catch {
    // Non-critical
  }
}
