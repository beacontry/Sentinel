import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { portfolios, portfolioTrades, traderDailyPnl } from "@/lib/db/schema";
import { eq, sql, gte, and, desc, inArray } from "drizzle-orm";
import type { PnlCalendarDay } from "@/types";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("pnl-calendar");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const source = (searchParams.get("source") || "both") as "portfolio" | "trader" | "both";
    const portfolioId = searchParams.get("portfolioId");
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 365, 1), 730);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const dayMap = new Map<string, { pnl: number; tradesCount: number; sources: Set<string> }>();

    // Portfolio P&L: aggregate net trade value per day. Single query across
    // all of the user's portfolios using inArray — replaces the prior
    // per-portfolio loop which was N+1 against portfolioTrades.
    if (source === "portfolio" || source === "both") {
      await withTimeout(3000, async (tx) => {
        const userPortfolios = await tx
          .select({ id: portfolios.id })
          .from(portfolios)
          .where(eq(portfolios.userId, session.userId as string));

        const portfolioIds = portfolioId
          ? userPortfolios.filter((p) => p.id === portfolioId).map((p) => p.id)
          : userPortfolios.map((p) => p.id);

        if (portfolioIds.length === 0) return;

        const dailyTrades = await tx
          .select({
            date: sql<string>`to_char(${portfolioTrades.executedAt}::date, 'YYYY-MM-DD')`.as("date"),
            pnl: sql<number>`sum(CASE WHEN ${portfolioTrades.action} = 'SELL' THEN ${portfolioTrades.price} * ${portfolioTrades.quantity} ELSE -${portfolioTrades.price} * ${portfolioTrades.quantity} END)`,
            tradesCount: sql<number>`count(*)`,
          })
          .from(portfolioTrades)
          .where(
            and(
              inArray(portfolioTrades.portfolioId, portfolioIds),
              gte(portfolioTrades.executedAt, cutoff)
            )
          )
          .groupBy(sql`${portfolioTrades.executedAt}::date`)
          .orderBy(sql`${portfolioTrades.executedAt}::date`);

        for (const row of dailyTrades) {
          const existing = dayMap.get(row.date);
          if (existing) {
            existing.pnl += Number(row.pnl ?? 0);
            existing.tradesCount += Number(row.tradesCount);
            existing.sources.add("portfolio");
          } else {
            dayMap.set(row.date, {
              pnl: Number(row.pnl ?? 0),
              tradesCount: Number(row.tradesCount),
              sources: new Set(["portfolio"]),
            });
          }
        }
      });
    }

    // Trader P&L: read from traderDailyPnl table
    if (source === "trader" || source === "both") {
      const traderRows = await withTimeout(3000, async (tx) =>
        tx
          .select({
            date: traderDailyPnl.date,
            realizedPnl: traderDailyPnl.realizedPnl,
            tradesCount: traderDailyPnl.tradesCount,
          })
          .from(traderDailyPnl)
          .where(and(gte(traderDailyPnl.date, cutoffStr), eq(traderDailyPnl.userId, session.userId)))
          .orderBy(desc(traderDailyPnl.date))
      );

      for (const row of traderRows) {
        const existing = dayMap.get(row.date);
        if (existing) {
          existing.pnl += Number(row.realizedPnl);
          existing.tradesCount += Number(row.tradesCount);
          existing.sources.add("trader");
        } else {
          dayMap.set(row.date, {
            pnl: Number(row.realizedPnl),
            tradesCount: Number(row.tradesCount),
            sources: new Set(["trader"]),
          });
        }
      }
    }

    // Build sorted day list
    const calendarDays: PnlCalendarDay[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => {
        const sources = Array.from(data.sources);
        let daySource: PnlCalendarDay["source"] = "both";
        if (sources.length === 1) {
          daySource = sources[0] as "portfolio" | "trader";
        }
        return {
          date,
          pnl: Math.round(data.pnl * 100) / 100,
          tradesCount: data.tradesCount,
          source: daySource,
        };
      });

    // Compute summary
    const profitDays = calendarDays.filter((d) => d.pnl > 0);
    const lossDays = calendarDays.filter((d) => d.pnl < 0);
    const totalPnl = calendarDays.reduce((sum, d) => sum + d.pnl, 0);
    const bestDay = calendarDays.length > 0
      ? calendarDays.reduce((best, d) => (d.pnl > best.pnl ? d : best), calendarDays[0])
      : null;
    const worstDay = calendarDays.length > 0
      ? calendarDays.reduce((worst, d) => (d.pnl < worst.pnl ? d : worst), calendarDays[0])
      : null;

    return NextResponse.json(
      {
        days: calendarDays,
        summary: {
          totalPnl: Math.round(totalPnl * 100) / 100,
          profitDays: profitDays.length,
          lossDays: lossDays.length,
          bestDay: bestDay ? { date: bestDay.date, pnl: bestDay.pnl } : null,
          worstDay: worstDay ? { date: worstDay.date, pnl: worstDay.pnl } : null,
        },
      },
      { headers: { "Cache-Control": "private, max-age=120" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "P&L calendar error");
    return NextResponse.json({ error: "Failed to load P&L calendar" }, { status: 500 });
  }
}
