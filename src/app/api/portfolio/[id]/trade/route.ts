import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { executeTrade } from "@/lib/portfolio-sim";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("portfolio-trade");
import { eq } from "drizzle-orm";
import { getMarketDataProvider } from "@/lib/market-data";
import { z } from "zod";

const tradeSchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  side: z.enum(["BUY", "SELL"]),
  shares: z.number().int().min(1).max(10000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.id, id))
    .limit(1);

  if (!portfolio || portfolio.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = tradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Get current market price
    const provider = getMarketDataProvider();
    const quote = await provider.fetchQuote(parsed.data.symbol);
    if (!quote) {
      return NextResponse.json(
        { error: "Unable to get current price" },
        { status: 422 }
      );
    }

    await executeTrade(
      id,
      parsed.data.symbol,
      parsed.data.side,
      parsed.data.shares,
      quote.price
    );

    return NextResponse.json({
      success: true,
      price: quote.price,
      total: quote.price * parsed.data.shares,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Insufficient cash" || message === "Insufficient shares") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    log.error({ err: message }, "Trade execution error");
    return NextResponse.json({ error: "Trade failed" }, { status: 500 });
  }
}
