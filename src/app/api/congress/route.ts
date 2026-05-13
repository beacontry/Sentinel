// GET /api/congress
//
// Recent Congressional trading disclosures, optionally filtered by symbol.
// Backed by the local `congressional_trades` table, which is populated
// from official sources (House Clerk bulk PTR archive; Senate eFD coming
// in Phase 2) by the daily refresh cron.
//
// History: this route used to call Finnhub's congressional-trading
// endpoint directly. Finnhub moved that endpoint to a paid tier
// 2026-05-XX so we migrated to scraping the official disclosure
// sources ourselves. The federal sources can't change pricing on us.
//
// Filings come from the federal Periodic Transaction Report (PTR) system —
// every member of Congress is required to disclose trades within 45 days.
// Amounts are reported as bounded ranges per disclosure rules, not exact
// dollar values; we surface the `amountFrom` / `amountTo` directly.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { congressionalTrades } from "@/lib/db/schema/congressional-trades";
import { and, desc, eq, sql } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("congress-api");

const SYMBOL_RE = /^[A-Z]{1,10}$/;

interface CongressTradeResponse {
  symbol: string;
  transactionDate: string;
  filingDate: string;
  name: string;
  position: string; // "House" | "Senate"
  ownerType: string;
  amountFrom: number;
  amountTo: number;
  transactionType: string;
  party?: string;
  sourceUrl?: string;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const rawSymbol = url.searchParams.get("symbol")?.trim().toUpperCase();
  const symbolParam = rawSymbol && SYMBOL_RE.test(rawSymbol) ? rawSymbol : null;
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit")) || 100));

  try {
    const rows = await withTimeout(5000, async (tx) => {
      const where = symbolParam
        ? and(eq(congressionalTrades.ticker, symbolParam))
        : undefined;
      return tx
        .select({
          ticker: congressionalTrades.ticker,
          transactionDate: congressionalTrades.transactionDate,
          filingDate: congressionalTrades.filingDate,
          filerName: congressionalTrades.filerName,
          chamber: congressionalTrades.chamber,
          ownerType: congressionalTrades.ownerType,
          amountFrom: congressionalTrades.amountFrom,
          amountTo: congressionalTrades.amountTo,
          transactionType: congressionalTrades.transactionType,
          party: congressionalTrades.party,
          sourceUrl: congressionalTrades.sourceUrl,
        })
        .from(congressionalTrades)
        .where(where)
        .orderBy(
          desc(congressionalTrades.transactionDate),
          desc(congressionalTrades.filingDate)
        )
        .limit(limit);
    });

    // Shape to match the existing UI contract — same JSON keys the page
    // already expects from the Finnhub-era response. ownerType, ticker
    // (renamed from symbol on the way out for backward compat), etc.
    const trades: CongressTradeResponse[] = rows.map((r) => ({
      symbol: r.ticker ?? "",
      transactionDate: String(r.transactionDate),
      filingDate: r.filingDate ? String(r.filingDate) : String(r.transactionDate),
      name: r.filerName,
      position: r.chamber, // House | Senate
      ownerType: r.ownerType ?? "Self",
      amountFrom: r.amountFrom ? Number(r.amountFrom) : 0,
      amountTo: r.amountTo ? Number(r.amountTo) : 0,
      transactionType: r.transactionType,
      party: r.party ?? undefined,
      sourceUrl: r.sourceUrl ?? undefined,
    }));

    // Total row count — useful for the UI's "ingest is empty" empty state
    // (vs "the filter matched zero").
    const totalRow = await withTimeout(2000, async (tx) => {
      return tx
        .select({ n: sql<number>`count(*)::int` })
        .from(congressionalTrades);
    });
    const totalRows = totalRow[0]?.n ?? 0;

    return NextResponse.json(
      {
        trades,
        symbol: symbolParam,
        count: trades.length,
        totalRows,
        upstreamSource: "official_house_senate",
      },
      // Filings update slowly (PTRs lag by up to 45 days). 1-hour cache.
      { headers: { "Cache-Control": "private, max-age=3600" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        {
          trades: [],
          error: "Database query timed out.",
          upstreamCategory: "timeout",
        },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, symbol: symbolParam }, "Congress query error");
    return NextResponse.json(
      {
        trades: [],
        error: "Could not read congressional_trades table — has the ingester run?",
        upstreamCategory: "server_error",
      },
      { status: 500 }
    );
  }
}
