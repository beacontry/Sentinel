import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, portfolioTrades } from "@/lib/db/schema";
import { traderTrades } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  generateForm8949,
  type TaxTrade,
  type FilingStatus,
} from "@/lib/tax-engine";
import { toCSV } from "@/lib/csv";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("tax-form8949");

const VALID_STATUSES: FilingStatus[] = [
  "single",
  "married_joint",
  "married_separate",
  "head_of_household",
];

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
  const filingStatusParam = searchParams.get("filingStatus") as FilingStatus | null;
  const ordinaryIncome = Number(searchParams.get("ordinaryIncome")) || 50000;

  const filingStatus: FilingStatus =
    filingStatusParam && VALID_STATUSES.includes(filingStatusParam)
      ? filingStatusParam
      : "single";

  // Tax-year boundaries anchored to ET, not UTC. A fill at ~8 PM ET on
  // Dec 31 is ~01:00 UTC the next day — with UTC boundaries it would fall
  // into the following tax year. Jan 1 and Dec 31 are always EST (US DST
  // never spans them), so the fixed -05:00 offset is correct for both edges.
  const yearStart = new Date(`${year}-01-01T00:00:00.000-05:00`);
  const yearEnd = new Date(`${year}-12-31T23:59:59.999-05:00`);

  try {
    const allTrades: TaxTrade[] = [];

    // 1. Fetch portfolio trades
    const userPortfolios = await db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(eq(portfolios.userId, session.userId as string));

    for (const p of userPortfolios) {
      const trades = await db
        .select()
        .from(portfolioTrades)
        .where(
          and(
            eq(portfolioTrades.portfolioId, p.id),
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
          source: "portfolio",
        });
      }
    }

    // 2. Fetch engine/trader trades (filled only). No SQL date filter —
    //    the tax year is set by the disposition (fill) date, not order
    //    creation, so filter in JS by fillTime (falling back to createdAt
    //    for the rare null-fillTime row) against the ET boundaries.
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
      // Use fillPrice/fillTime when available, fall back to order data
      const price = t.fillPrice ?? t.limitPrice ?? 0;
      if (price <= 0) continue; // skip unfilled
      const executedAt = t.fillTime ?? t.createdAt;
      if (executedAt < yearStart || executedAt > yearEnd) continue;

      allTrades.push({
        symbol: t.symbol,
        action: t.action,
        quantity: t.quantity,
        price,
        executedAt: executedAt.toISOString(),
        source: "engine",
      });
    }

    if (allTrades.length === 0) {
      const emptyResult = generateForm8949([], { filingStatus, ordinaryIncome });
      return NextResponse.json(
        { year, ...emptyResult },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const result = generateForm8949(allTrades, { filingStatus, ordinaryIncome });

    // CSV export — Form 8949 compatible format
    if (format === "csv") {
      const headers = [
        "Description",
        "Date Acquired",
        "Date Sold",
        "Proceeds",
        "Cost Basis",
        "Adjustment Code",
        "Adjustment Amount",
        "Gain or Loss",
        "Term",
        "Source",
      ];
      const rows = result.lines
        .sort((a, b) => a.dateSold.localeCompare(b.dateSold))
        .map((l) => [
          `${l.quantity} sh ${l.symbol}`,
          l.dateAcquired,
          l.dateSold,
          l.proceeds.toFixed(2),
          l.costBasis.toFixed(2),
          l.washSale ? "W" : "",
          l.washSale ? l.washSaleDisallowed.toFixed(2) : "",
          l.gainLoss.toFixed(2),
          l.isLongTerm ? "Long-term" : "Short-term",
          l.source,
        ]);

      const csv = toCSV(headers, rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="form-8949-${year}.csv"`,
        },
      });
    }

    return NextResponse.json(
      { year, ...result },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Form 8949 generation error");
    return NextResponse.json(
      { error: "Failed to generate Form 8949 report" },
      { status: 500 }
    );
  }
}
