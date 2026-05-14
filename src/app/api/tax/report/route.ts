import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, portfolioTrades, traderTrades } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { calculateTaxSummary, type TaxTrade } from "@/lib/tax-engine";
import { toCSV } from "@/lib/csv";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("tax-report");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  const searchParams = request.nextUrl.searchParams;
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const format = searchParams.get("format"); // "csv" for export

  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59Z`);

  try {
    // 1. Manual portfolio trades
    const userPortfolios = await db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(eq(portfolios.userId, session.userId as string));

    const portfolioIds = userPortfolios.map((p) => p.id);

    const allTrades: TaxTrade[] = [];

    for (const pId of portfolioIds) {
      const trades = await db
        .select()
        .from(portfolioTrades)
        .where(
          and(
            eq(portfolioTrades.portfolioId, pId),
            gte(portfolioTrades.executedAt, yearStart),
            lte(portfolioTrades.executedAt, yearEnd)
          )
        );

      for (const t of trades) {
        allTrades.push({
          symbol: t.symbol,
          action: t.action,
          quantity: t.quantity,
          price: t.price,
          executedAt: t.executedAt.toISOString(),
        });
      }
    }

    // 2. Live engine trades (Alpaca fills) — filter by fill time, not order creation,
    //    so trades placed in Dec but filled in Jan land in the right tax year.
    const engineTrades = await db
      .select()
      .from(traderTrades)
      .where(
        and(
          eq(traderTrades.userId, session.userId as string),
          eq(traderTrades.status, "FILLED")
        )
      );

    for (const t of engineTrades) {
      const price = t.fillPrice ?? t.limitPrice ?? 0;
      if (price <= 0) continue;
      const executedAt = t.fillTime ?? t.createdAt;
      if (executedAt < yearStart || executedAt > yearEnd) continue;

      // Normalize engine action vocabulary (BUY / SELL / manual_close) to BUY/SELL
      const action = t.action.toUpperCase() === "BUY" ? "BUY" : "SELL";

      allTrades.push({
        symbol: t.symbol,
        action,
        quantity: t.quantity,
        price,
        executedAt: executedAt.toISOString(),
      });
    }

    if (allTrades.length === 0) {
      const emptyResult = {
        year,
        summary: {
          shortTermGains: 0,
          shortTermLosses: 0,
          longTermGains: 0,
          longTermLosses: 0,
          netGain: 0,
          estimatedTax: 0,
          tradeCount: 0,
        },
        trades: [],
      };
      return NextResponse.json(emptyResult, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const summary = calculateTaxSummary(allTrades);

    // CSV export
    if (format === "csv") {
      const headers = ["Date", "Symbol", "Action", "Quantity", "Price", "Total"];
      const rows = allTrades
        .sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime())
        .map((t) => [
          new Date(t.executedAt).toISOString().slice(0, 10),
          t.symbol,
          t.action,
          String(t.quantity),
          t.price.toFixed(2),
          (t.quantity * t.price).toFixed(2),
        ]);

      const csv = toCSV(headers, rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="tax-trades-${year}.csv"`,
        },
      });
    }

    return NextResponse.json(
      { year, summary, trades: allTrades },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Tax report error");
    return NextResponse.json(
      { error: "Failed to generate tax report" },
      { status: 500 }
    );
  }
}
