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

  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59Z`);

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

    // 2. Fetch engine/trader trades (filled only)
    const engineTrades = await db
      .select()
      .from(traderTrades)
      .where(
        and(
          eq(traderTrades.userId, session.userId as string),
          eq(traderTrades.status, "FILLED"),
          gte(traderTrades.createdAt, yearStart),
          lte(traderTrades.createdAt, yearEnd)
        )
      );

    for (const t of engineTrades) {
      // Use fillPrice/fillTime when available, fall back to order data
      const price = t.fillPrice ?? t.limitPrice ?? 0;
      const executedAt = t.fillTime ?? t.createdAt;
      if (price <= 0) continue; // skip unfilled

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
