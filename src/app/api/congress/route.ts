// GET /api/congress
//
// Recent Congressional trading disclosures, optionally filtered by symbol.
// Backed by Finnhub's /stock/congressional-trading endpoint (which is on
// our existing FINNHUB_API_KEY tier, so no new credentials required).
//
// Filings come from the federal Periodic Transaction Report (PTR) system —
// every member of Congress is required to disclose trades within 45 days.
// Amounts are reported as bounded ranges per disclosure rules, not exact
// dollar values; we surface the `amountFrom` / `amountTo` directly.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("congress-api");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const symbolParam = url.searchParams.get("symbol")?.trim().toUpperCase();
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit")) || 100));

  const finnhub = getFinnhubClient();
  if (!finnhub.isConfigured) {
    return NextResponse.json(
      {
        trades: [],
        error: "Finnhub API key not configured — Congressional trade data unavailable.",
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  // Hard 6s upper bound on the upstream call. The Finnhub client has its
  // own 10s timeout AND a 60-req/min rate limiter that can wait up to ~60s
  // when other Finnhub callers (news, sentiment, etc.) saturate the bucket.
  // Combined, the route could hang long enough for Caddy/Cloudflare to
  // return their own 502 with HTML body — which the UI then sees as a
  // generic "Server returned 502" because it can't parse Caddy's HTML.
  // Capping at 6s here keeps the failure inside our handler so we can
  // return a clean JSON error.
  const ROUTE_TIMEOUT_MS = 6000;
  try {
    const response = await Promise.race([
      finnhub.getCongressionalTrading(symbolParam || undefined),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Finnhub API error: 504 Timeout after ${ROUTE_TIMEOUT_MS}ms`)),
          ROUTE_TIMEOUT_MS
        )
      ),
    ]);
    const trades = (response.data ?? [])
      // Sort newest-filing first (transactionDate is what users care about,
      // but filings can be backdated months — secondary sort on filingDate)
      .sort((a, b) => {
        const txDelta =
          new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime();
        if (txDelta !== 0) return txDelta;
        return new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime();
      })
      .slice(0, limit);

    return NextResponse.json(
      {
        trades,
        symbol: symbolParam || null,
        count: trades.length,
      },
      // Filings update slowly (PTRs lag by up to 45 days). 1-hour cache.
      { headers: { "Cache-Control": "private, max-age=3600" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, symbol: symbolParam }, "Congress fetch error");

    // Extract upstream status from the Finnhub error message. The client
    // throws `Finnhub API error: 403 Forbidden` (etc.) so we parse that
    // back out and surface it. Lets the UI render something actionable
    // ("Finnhub returned 403 — this endpoint may require a paid tier")
    // instead of a generic "Failed to load."
    const upstreamMatch = message.match(/Finnhub API error: (\d+)/);
    const upstreamStatus = upstreamMatch ? parseInt(upstreamMatch[1], 10) : null;

    let userMessage = "Could not reach Congressional trade feed.";
    let upstreamCategory: "paid_tier" | "rate_limit" | "timeout" | "server_error" | "unknown" = "unknown";
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      userMessage =
        `Finnhub returned ${upstreamStatus} — Congressional trading may now ` +
        `require a paid Finnhub tier. The endpoint was free as of late 2025; ` +
        `Finnhub has been moving alternative-data endpoints to paid plans.`;
      upstreamCategory = "paid_tier";
    } else if (upstreamStatus === 429) {
      userMessage = "Finnhub rate-limited the request. Try again in a minute.";
      upstreamCategory = "rate_limit";
    } else if (upstreamStatus === 504) {
      userMessage =
        "Finnhub took too long to respond (>6s). The endpoint may be slow or " +
        "the request was queued behind other Finnhub calls.";
      upstreamCategory = "timeout";
    } else if (upstreamStatus && upstreamStatus >= 500) {
      userMessage = `Finnhub returned ${upstreamStatus} — their server-side issue. Try again shortly.`;
      upstreamCategory = "server_error";
    } else if (upstreamStatus) {
      userMessage = `Finnhub returned ${upstreamStatus}.`;
    }

    return NextResponse.json(
      {
        trades: [],
        error: userMessage,
        upstreamStatus,
        upstreamCategory,
      },
      // 502 maps the upstream failure cleanly; client treats this as a
      // surfaceable error (data.error is rendered as-is).
      { status: 502 }
    );
  }
}
