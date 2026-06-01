/**
 * Small-cap momentum scanner — live gapper feed.
 *
 * POST /api/momentum/scan
 *   body: { filters?: Partial<GapperFilters>; universeSize?: number }
 *
 * Seeds the universe from Polygon's top-gainers snapshot, then runs the
 * pure scanForGappers() planner with the live snapshot + Finnhub float
 * fetchers wired in.
 *
 * Graceful degradation: when POLYGON_API_KEY is unset, returns
 * { configured: false, candidates: [] } so the UI can show setup
 * instructions instead of a generic 500.
 *
 * Trader-tier gated. Doesn't call the LLM, so doesn't need premium.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { z } from "zod";
import { checkTier } from "@/lib/tiers-server";
import { createRouteLogger } from "@/lib/logger";
import {
  fetchTopGainers,
  fetchTickerSnapshot,
  isPolygonConfigured,
} from "@/lib/providers/polygon";
import {
  scanForGappers,
  fetchFloatFromFinnhub,
  DEFAULT_GAPPER_FILTERS,
} from "@/lib/momentum/gapper-scanner";

const log = createRouteLogger("momentum/scan");

const filtersSchema = z
  .object({
    minPrice: z.number().min(0).max(1000).optional(),
    maxPrice: z.number().min(0).max(10000).optional(),
    maxFloat: z.number().min(0).max(10_000_000_000).optional(),
    minGapPct: z.number().min(0).max(10).optional(),
    minRvol: z.number().min(0).max(1000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict()
  .optional();

const bodySchema = z
  .object({
    filters: filtersSchema,
    universeSize: z.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: unknown = {};
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
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
      candidates: [],
      examined: 0,
      skipped: null,
      message:
        "POLYGON_API_KEY not set. Add it via admin → System Config to enable the live scanner.",
    });
  }

  try {
    const gainers = await fetchTopGainers(parsed.data.universeSize);
    if (gainers.length === 0) {
      return NextResponse.json({
        configured: true,
        candidates: [],
        examined: 0,
        skipped: null,
        message:
          "Polygon returned no gainers — markets may be closed or the snapshot endpoint is empty.",
      });
    }

    const universe = gainers.map((g) => g.symbol);
    const result = await scanForGappers({
      universe,
      fetchSnapshot: fetchTickerSnapshot,
      fetchFloat: fetchFloatFromFinnhub,
      filters: parsed.data.filters,
    });

    log.info(
      {
        userId: auth.userId,
        universeSize: universe.length,
        kept: result.candidates.length,
      },
      "momentum scan complete"
    );

    return NextResponse.json({
      configured: true,
      candidates: result.candidates,
      examined: result.examined,
      skipped: result.skipped,
      filters: { ...DEFAULT_GAPPER_FILTERS, ...(parsed.data.filters ?? {}) },
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", userId: auth.userId },
      "momentum scan failed"
    );
    return NextResponse.json(
      { error: "Scanner failed — check logs" },
      { status: 500 }
    );
  }
}
