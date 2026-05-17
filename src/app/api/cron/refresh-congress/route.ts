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
import { refreshSenateRecent } from "@/lib/congress-senate-ingester";
import { createRouteLogger } from "@/lib/logger";
import { safeCompare } from "@/lib/crypto";

const log = createRouteLogger("cron-refresh-congress");

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || !secret || !safeCompare(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  log.info("Congress refresh: starting");

  const stats = {
    houseYears: [] as Awaited<ReturnType<typeof refreshHouseRecent>>,
    senateYears: [] as Awaited<ReturnType<typeof refreshSenateRecent>>,
    houseError: null as string | null,
    senateError: null as string | null,
    durationMs: 0,
    success: false,
  };

  // House ingest — independent of Senate; one failing doesn't tank the other.
  try {
    stats.houseYears = await refreshHouseRecent();
  } catch (err) {
    stats.houseError = err instanceof Error ? err.message : "unknown";
    log.error({ err: stats.houseError }, "House ingest failed");
  }

  // Senate ingest
  try {
    stats.senateYears = await refreshSenateRecent();
  } catch (err) {
    stats.senateError = err instanceof Error ? err.message : "unknown";
    log.error({ err: stats.senateError }, "Senate ingest failed");
  }

  stats.success = !stats.houseError || !stats.senateError;
  stats.durationMs = Date.now() - startedAt;

  if (!stats.success) {
    return NextResponse.json(stats, { status: 500 });
  }

  log.info(stats, "Congress refresh: complete");
  return NextResponse.json(stats);
}
