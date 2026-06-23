/**
 * Momentum analyzer — runs analyzeMomentumBars on today's 1-min Polygon
 * bars for a given symbol.
 *
 * POST /api/momentum/analyze
 *   body: { symbol: string }
 *
 * Returns the MomentumAnalysisResult: signal, confidence, pattern,
 * suggested stop, indicator snapshot, reasons. Caller decides whether to
 * act — the route never places orders.
 *
 * Graceful no-key fallback: returns { configured: false } so UI shows
 * setup instructions instead of a 500.
 *
 * Trader-tier gated. Doesn't call the LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { z } from "zod";
import { checkTier } from "@/lib/tiers-server";
import { createRouteLogger } from "@/lib/logger";
import {
  fetchMinuteBars,
  isPolygonConfigured,
} from "@/lib/providers/polygon";
import { analyzeMomentumBars } from "@/lib/indicators/momentum-analyzer";

const log = createRouteLogger("momentum/analyze");

const bodySchema = z
  .object({
    symbol: z.string().min(1).max(10).regex(/^[A-Z0-9.-]+$/i),
  })
  .strict();

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  if (!(await isPolygonConfigured())) {
    return NextResponse.json({
      configured: false,
      message:
        "POLYGON_API_KEY not set. Add it via admin → System Config to enable the analyzer.",
    });
  }

  const symbol = parsed.data.symbol.toUpperCase();
  // Today's session — Polygon returns minute bars for any date range; we ask
  // for today twice (from = to) and get the day's worth of intraday minutes.
  const today = new Date();

  try {
    const rawBars = await fetchMinuteBars(symbol, today, today);
    if (rawBars.length === 0) {
      return NextResponse.json({
        configured: true,
        symbol,
        result: null,
        message:
          "No bars returned. Markets may be closed, or the symbol may be delisted / not covered by Polygon's plan.",
      });
    }

    // Drop the live, unclosed final minute bar (audit #46). Polygon timestamps
    // a minute aggregate at the START of its minute, so the most recent bar is
    // still in-progress until 60s elapse. analyzeMomentumBars treats the last
    // bar as a CLOSED breakout bar (volume multiple + breakout close), so a
    // partial bar yields a flickering, look-ahead signal that can reverse once
    // the true close prints. Exclude it when it's younger than one minute.
    const last = rawBars[rawBars.length - 1];
    const bars =
      last && Date.now() - new Date(last.date).getTime() < 60_000
        ? rawBars.slice(0, -1)
        : rawBars;
    if (bars.length === 0) {
      return NextResponse.json({
        configured: true,
        symbol,
        result: null,
        message:
          "Only the current, unclosed minute bar is available — retry after it closes.",
      });
    }

    const result = analyzeMomentumBars(symbol, bars);
    log.info(
      {
        userId: auth.userId,
        symbol,
        signal: result.signal,
        confidence: result.confidence,
        barCount: bars.length,
      },
      "momentum analyze complete"
    );

    return NextResponse.json({
      configured: true,
      symbol,
      barCount: bars.length,
      result,
    });
  } catch (err) {
    log.error(
      {
        err: err instanceof Error ? err.message : "unknown",
        userId: auth.userId,
        symbol,
      },
      "momentum analyze failed"
    );
    return NextResponse.json(
      { error: "Analyzer failed — check logs" },
      { status: 500 }
    );
  }
}
