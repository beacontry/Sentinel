/**
 * GET /api/cron/refresh-congress
 *
 * Daily-scheduled ingester for federal Congressional trade disclosures.
 * Pulls the House Clerk PTR archive (current year + last year in Jan-Feb
 * to cover late filings across the year boundary).
 *
 * Auth: x-cron-secret header matched against CRON_SECRET env var.
 * Schedule: trigger daily at 6am ET via external scheduler (e.g.
 * Cloudflare cron, GitHub Action, droplet cron). 1x/day is plenty —
 * PTRs have a 45-day disclosure window, so even hourly polling is
 * overkill.
 *
 * Idempotent — re-running upserts the same rows and silently skips
 * duplicates via the congressional_trades_unique constraint.
 *
 * Senate ingest will be added here in Phase 2.
 */

import { NextRequest, NextResponse } from "next/server";
import { refreshHouseRecent } from "@/lib/congress-house-ingester";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("cron-refresh-congress");

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  log.info("Congress refresh: starting");

  const stats = {
    houseYears: [] as Awaited<ReturnType<typeof refreshHouseRecent>>,
    durationMs: 0,
    success: false,
  };

  try {
    stats.houseYears = await refreshHouseRecent();
    stats.success = true;
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Congress refresh failed"
    );
    return NextResponse.json(
      { error: "House ingest failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  } finally {
    stats.durationMs = Date.now() - startedAt;
  }

  log.info(stats, "Congress refresh: complete");
  return NextResponse.json(stats);
}
