// GET /api/bars/[symbol]?days=180
//
// Read-only daily OHLCV bars for charting. Replay needs raw bars, and the
// only routes that fetched them either returned an analysis without the bars
// (/api/analyze/[symbol], which also stores a signal) or did not exist
// (/api/analyze?symbol=). This one fetches and returns bars and writes
// nothing.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";
import { rateLimit } from "@/lib/rate-limiter";

const log = createRouteLogger("bars");

const BARS_RATE_LIMIT = { max: 60, windowSeconds: 60 };
const DEFAULT_DAYS = 180;
const MAX_DAYS = 365;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  const limit = rateLimit(`bars:${session.userId}`, BARS_RATE_LIMIT.max, BARS_RATE_LIMIT.windowSeconds);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  if (!/^[A-Z]{1,10}$/.test(upperSymbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const daysParam = parseInt(new URL(request.url).searchParams.get("days") ?? "", 10);
  const days = daysParam > 0 && daysParam <= MAX_DAYS ? daysParam : DEFAULT_DAYS;

  try {
    const bars = await getMarketDataProvider().fetchBars(upperSymbol, days, "1d");
    return NextResponse.json(
      { symbol: upperSymbol, resolution: "1d", bars },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err), symbol: upperSymbol }, "Bars fetch error");
    return NextResponse.json({ error: "Failed to load bars" }, { status: 500 });
  }
}
