import { NextRequest, NextResponse } from "next/server";
import { validateTraderSecret } from "@/lib/trader-auth";
import { traderSignalSchema } from "@/lib/trader-validators";
import { db } from "@/lib/db";
import { traderSignals, traderStatus } from "@/lib/db/schema";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("trader-signals");

export async function POST(request: NextRequest) {
  const authError = validateTraderSecret(request);
  if (authError) return authError;

  const body = await request.json();
  const parsed = traderSignalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [row] = await db
      .insert(traderSignals)
      .values({
        symbol: parsed.data.symbol.toUpperCase(),
        signal: parsed.data.signal,
        price: parsed.data.price,
        volume: parsed.data.volume,
        indicators: parsed.data.indicators,
        actedOn: parsed.data.acted_on,
        traderTimestamp: new Date(parsed.data.timestamp),
      })
      .returning({ id: traderSignals.id });

    // Update heartbeat
    await upsertHeartbeat();

    return NextResponse.json({ id: row.id, received: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Trader signal error");
    return NextResponse.json({ error: "Failed to store signal" }, { status: 500 });
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
