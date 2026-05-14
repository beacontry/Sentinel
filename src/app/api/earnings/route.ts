import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("earnings");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ error: "symbols parameter required" }, { status: 400 });
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{1,10}$/.test(s))
    .slice(0, 20);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols" }, { status: 400 });
  }

  const client = getFinnhubClient();
  if (!client.isConfigured) {
    return NextResponse.json({ earnings: [], configured: false }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  try {
    // Look 90 days ahead and 30 days back.
    // Was 30/7. Widened 2026-05-13 because:
    //   - Most companies announce earnings dates ~30 days out, so a 30-day
    //     window meant freshly-added watchlist symbols often showed empty
    //     until their date got published. Users reported "I added these
    //     tickers but they don't appear."
    //   - 30 days back catches the previous quarter's beat/miss context
    //     when reviewing recent watchlist activity.
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const to = new Date(now.getTime() + 90 * 86400000).toISOString().slice(0, 10);

    const results = await Promise.allSettled(
      symbols.map((s) => client.getEarningsCalendar(from, to, s))
    );

    const earnings = results.flatMap((r, i) => {
      if (r.status !== "fulfilled") return [];
      return (r.value.earningsCalendar ?? []).map((e) => ({
        symbol: e.symbol || symbols[i],
        date: e.date,
        epsEstimate: e.epsEstimate,
        epsActual: e.epsActual,
        revenueEstimate: e.revenueEstimate,
        revenueActual: e.revenueActual,
        hour: e.hour,
      }));
    });

    return NextResponse.json({ earnings, configured: true }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Earnings fetch error");
    return NextResponse.json(
      { error: "Failed to fetch earnings" },
      { status: 500 }
    );
  }
}
