/**
 * Phase 17 — Tax report generator route.
 *
 * GET /api/export/tax-report?year=2025&format=summary
 *   format=summary   → JSON with totals (Short-Term, Long-Term, net realized)
 *   format=csv       → IRS Form 8949-compatible CSV (combined ST + LT)
 *   format=st-csv    → Short-term only
 *   format=lt-csv    → Long-term only
 *
 * Reads FILLED trades for the calling user from trader_trades, applies FIFO
 * lot matching + §1091 wash-sale flagging via src/lib/tax-report.ts,
 * returns the result.
 *
 * Not a substitute for a tax professional. Disclaimer surfaced in UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { traderTrades } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import {
  computeFifoClosedLots,
  filterByTaxYear,
  summarize,
  formatForm8949Csv,
  type TaxTradeEvent,
} from "@/lib/tax-report";
import { csvAttachmentHeaders } from "@/lib/csv";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("export/tax-report");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const yearStr = url.searchParams.get("year");
  const format = (url.searchParams.get("format") ?? "summary").toLowerCase();
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return new Response("Invalid year", { status: 400 });
  }
  if (!["summary", "csv", "st-csv", "lt-csv"].includes(format)) {
    return new Response("Invalid format (summary|csv|st-csv|lt-csv)", { status: 400 });
  }

  try {
    // Pull all FILLED rows for this user across all time (FIFO needs full
    // history to identify wash-sale replacement buys outside the tax year).
    // statement_timeout 10s for the wider window.
    const rows = await withTimeout(10_000, async (tx) => {
      return tx
        .select({
          id: traderTrades.id,
          symbol: traderTrades.symbol,
          action: traderTrades.action,
          quantity: traderTrades.quantity,
          fillPrice: traderTrades.fillPrice,
          fillTime: traderTrades.fillTime,
          traderTimestamp: traderTrades.traderTimestamp,
          notes: traderTrades.notes,
        })
        .from(traderTrades)
        .where(
          and(
            eq(traderTrades.userId, session.userId),
            eq(traderTrades.status, "FILLED"),
            isNotNull(traderTrades.fillPrice)
          )
        );
    });

    const events: TaxTradeEvent[] = rows
      .filter(
        (r) =>
          r.fillPrice !== null &&
          (r.action === "BUY" || r.action === "SELL" || r.action === "manual_close")
      )
      .map((r) => ({
        id: r.id,
        symbol: r.symbol,
        // manual_close is an engine/user disposal — normalize to SELL so its
        // realized gain is reported and its lot is closed in FIFO. Dropping it
        // (the prior BUY/SELL-only filter) omitted the gain AND left the lot
        // perpetually open, corrupting subsequent FIFO matching.
        action: (r.action === "BUY" ? "BUY" : "SELL") as "BUY" | "SELL",
        quantity: r.quantity,
        fillPrice: r.fillPrice!,
        fillTime: r.fillTime ?? r.traderTimestamp,
        notes: r.notes,
      }));

    const allClosed = computeFifoClosedLots(events);
    const yearLots = filterByTaxYear(allClosed, year);

    if (format === "summary") {
      const summary = summarize(yearLots);
      return NextResponse.json({
        userId: session.userId,
        year,
        summary,
        // Include lots in JSON for client-side preview before downloading CSV
        closedLots: yearLots.map((l) => ({
          symbol: l.symbol,
          quantity: l.quantity,
          dateAcquired: l.dateAcquired.toISOString().slice(0, 10),
          dateSold: l.dateSold.toISOString().slice(0, 10),
          costBasis: l.costBasis,
          proceeds: l.proceeds,
          realizedGainLoss: l.realizedGainLoss,
          isLongTerm: l.isLongTerm,
          washSaleDisallowed: l.washSaleDisallowed,
        })),
        disclaimer:
          "Self-attested. Beacontry computes FIFO realized gains + §1091 wash sale flags but is NOT a tax professional. Verify with your CPA before filing. Wash-sale rule is applied at symbol level only — substantially-identical ETF cross-matches (e.g. SPY↔IVV) NOT detected. §475(f) MTM-elected traders should disregard wash-sale flags (the engine respects MTM elsewhere; this report does not).",
      });
    }

    // CSV path
    const { shortTerm, longTerm } = formatForm8949Csv(yearLots);
    let body: string;
    let filenameSuffix: string;
    if (format === "st-csv") {
      body = shortTerm;
      filenameSuffix = "short-term";
    } else if (format === "lt-csv") {
      body = longTerm;
      filenameSuffix = "long-term";
    } else {
      // combined
      body =
        "Short-term capital gains (Form 8949 Part I)\r\n" +
        shortTerm +
        "\r\nLong-term capital gains (Form 8949 Part II)\r\n" +
        longTerm;
      filenameSuffix = "form-8949";
    }

    const filename = `sentinel-tax-${year}-${filenameSuffix}.csv`;
    return new Response(body, { status: 200, headers: csvAttachmentHeaders(filename) });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return new Response("Query timed out — too many trades in history", { status: 504 });
    }
    log.error(
      { err: err instanceof Error ? err.message : "unknown", userId: session.userId, year },
      "Tax report failed"
    );
    return new Response("Failed to generate tax report", { status: 500 });
  }
}
