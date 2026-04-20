import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getScreenerCache, scanAllSymbols, filterResults, startScreenerScheduler } from "@/lib/screener";
import type { ScreenerFilter } from "@/lib/screener";
import { SCREENER_CONFIG } from "@/lib/config";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("screener");
import { isTraderConfigured } from "@/lib/trader-client";
import { z } from "zod";

export const maxDuration = 120; // Allow up to 2 minutes for full market scan

const screenerFilterSchema = z.object({
  field: z.enum(["signal", "rsi_14", "confidence", "price", "volumeRatio", "sector", "atr_14"]),
  operator: z.enum(["gt", "lt", "eq", "gte", "lte", "in"]),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
});

const screenerPostSchema = z.object({
  filters: z
    .array(screenerFilterSchema)
    .max(SCREENER_CONFIG.maxFilters, `Maximum ${SCREENER_CONFIG.maxFilters} filters allowed`)
    .default([]),
});

export async function GET() {
  // Start the auto-scan scheduler on first request
  startScreenerScheduler();

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cache = getScreenerCache();
    const ageMs = Date.now() - cache.scannedAt.getTime();
    const stale = ageMs > SCREENER_CONFIG.cacheTtlSeconds * 1000;
    const hasData = cache.results.length > 0;

    return NextResponse.json(
      {
        results: cache.results,
        scannedAt: cache.scannedAt.toISOString(),
        scanning: cache.scanning,
        stale: hasData ? stale : true,
        count: cache.results.length,
        traderPush: cache.traderPushResults ?? [],
        traderConfigured: isTraderConfigured(),
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Screener GET error");
    return NextResponse.json(
      { error: "Failed to retrieve screener results" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Start the auto-scan scheduler on first request
  startScreenerScheduler();

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = screenerPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const filters: ScreenerFilter[] = parsed.data.filters;

  try {
    const cache = getScreenerCache();
    const ageMs = Date.now() - cache.scannedAt.getTime();
    const stale = ageMs > SCREENER_CONFIG.cacheTtlSeconds * 1000;

    // If cache is empty or stale, trigger a fresh scan
    let results = cache.results;
    let scannedAt = cache.scannedAt;
    let freshScan = false;

    if (results.length === 0 || stale) {
      results = await scanAllSymbols();
      scannedAt = new Date();
      freshScan = true;
    }

    // Apply filters
    const filtered = filterResults(results, filters);

    return NextResponse.json(
      {
        results: filtered,
        scannedAt: scannedAt.toISOString(),
        scanning: false,
        stale: !freshScan && stale,
        count: filtered.length,
        totalSymbols: results.length,
        traderPush: cache.traderPushResults ?? [],
        traderConfigured: isTraderConfigured(),
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Screener POST error");
    return NextResponse.json(
      { error: "Screener scan failed" },
      { status: 500 }
    );
  }
}
