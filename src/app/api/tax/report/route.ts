import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, portfolioTrades, traderTrades } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateTaxSummary, type TaxTrade } from "@/lib/tax-engine";
import { toCSV } from "@/lib/csv";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";
import { getETDateString } from "@/lib/market-hours";

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

  // Tax-year boundaries anchored to ET, not UTC. A fill at ~8 PM ET on
  // Dec 31 is ~01:00 UTC the next day — with UTC boundaries it would fall
  // into the following tax year. Jan 1 and Dec 31 are always EST (US DST
  // never spans them), so the fixed -05:00 offset is correct for both edges.
  const yearStart = new Date(`${year}-01-01T00:00:00.000-05:00`);
  const yearEnd = new Date(`${year}-12-31T23:59:59.999-05:00`);

  try {
    // 1. Manual portfolio trades — FULL history (FIFO needs prior-year buy
    //    lots to supply cost basis; we report only the tax year's disposals).
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
        .where(eq(portfolioTrades.portfolioId, pId));

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

    // 2. Live engine trades (Alpaca fills) — FULL history, fill-time based.
    //    FIFO matches across years; only the year's disposals are reported.
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

    // FIFO over the FULL history (so prior-year buy lots supply cost basis),
    // reporting only disposals whose SELL falls in the ET-anchored tax year.
    // Filtering trades to the year BEFORE FIFO (the old behavior) dropped the
    // basis of any lot bought in a prior year, losing/garbling its gain (#8).
    const summary = calculateTaxSummary(allTrades, {
      taxYearStart: yearStart,
      taxYearEnd: yearEnd,
    });

    // Raw trade list (CSV + JSON preview) is the tax year's own trades only.
    const yearTrades = allTrades.filter((t) => {
      const ts = new Date(t.executedAt);
      return ts >= yearStart && ts <= yearEnd;
    });

    // CSV export
    if (format === "csv") {
      const headers = ["Date", "Symbol", "Action", "Quantity", "Price", "Total"];
      const rows = yearTrades
        .sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime())
        .map((t) => [
          // ET trade date — matches the tax-year bucketing above. A UTC
          // slice would print Jan 1 for a Dec 31 evening fill.
          getETDateString(new Date(t.executedAt)),
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
      { year, summary, trades: yearTrades },
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
