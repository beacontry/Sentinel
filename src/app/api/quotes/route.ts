// GET /api/quotes?symbols=AAPL,MSFT,NVDA
//
// Batch quote endpoint — returns last close + intraday change % for each
// requested symbol. Used by the Watchlists page, Portfolio overview, and
// anywhere else that needs price-only data for a list of symbols.
//
// Distinguishes itself from /api/analyze (which runs the full hybrid
// pipeline per symbol → expensive and slow for 20+ tickers). This
// endpoint pulls 2 daily bars per symbol and computes change% from
// (last - prev) / prev.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("quotes");

const SYMBOL_RE = /^[A-Z][A-Z0-9]{0,4}(\.[A-Z])?$/;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawSymbols = (url.searchParams.get("symbols") ?? "")
    .toUpperCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SYMBOL_RE.test(s));

  // De-dupe, cap at 100 — keeps a runaway request from hammering the
  // provider. Tighter than the watchlist's 200-symbol cap because this
  // is a fan-out endpoint and watchlist pagination is upstream.
  const symbols = [...new Set(rawSymbols)].slice(0, 100);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {} });
  }

  const provider = getMarketDataProvider();
  // Parallel fetch — provider's own cache (5–11 min disk TTL) prevents
  // re-hits when this is called from polling. Promise.allSettled so one
  // bad symbol doesn't tank the whole batch.
  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const bars = await provider.fetchBars(sym, 2, "1d");
      if (!bars || bars.length < 1) return null;
      const last = bars[bars.length - 1];
      const prev = bars.length >= 2 ? bars[bars.length - 2] : null;
      const change = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
      return { symbol: sym, price: last.close, change };
    })
  );

  const quotes: Record<string, { price: number; change: number }> = {};
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      quotes[r.value.symbol] = { price: r.value.price, change: r.value.change };
    }
  }

  return NextResponse.json(
    { quotes, count: Object.keys(quotes).length, requested: symbols.length },
    // 60s private cache — quotes are public-ish but session-gated; clients
    // poll every 30-60s anyway so this just smooths spikes.
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}

void log;
