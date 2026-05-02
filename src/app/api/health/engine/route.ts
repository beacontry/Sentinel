import { NextResponse } from "next/server";
import { getAllEngineSnapshots, isMarketOpen } from "@/lib/trading-engine";

/**
 * Public engine health endpoint for external uptime monitors (Better Uptime,
 * UptimeRobot, etc.). Returns aggregate counts only — no userIds, no positions,
 * nothing that could leak account state. Catches the "container is dead" case
 * the in-process watchdog can't.
 *
 * Response status:
 *   200 — everything is fine (or all engines stopped, which is also fine)
 *   503 — at least one engine should be running but is stalled or disconnected
 *         from the broker; uptime monitor should treat this as down.
 */
export async function GET() {
  const snapshots = getAllEngineSnapshots();
  const marketOpen = isMarketOpen();
  const now = Date.now();

  const STALL_THRESHOLD_MS = 5 * 60 * 1000;

  let running = 0;
  let halted = 0;
  let stalled = 0;
  let brokerDown = 0;
  let oldestLastScanSec: number | null = null;

  for (const s of snapshots) {
    if (s.halted) halted++;
    if (s.running) {
      running++;
      if (!s.brokerConnected) brokerDown++;
      if (marketOpen && s.lastScanAt) {
        const ageSec = Math.floor((now - s.lastScanAt.getTime()) / 1000);
        if (now - s.lastScanAt.getTime() > STALL_THRESHOLD_MS) stalled++;
        if (oldestLastScanSec === null || ageSec > oldestLastScanSec) {
          oldestLastScanSec = ageSec;
        }
      }
    }
  }

  const unhealthy = stalled > 0 || brokerDown > 0;

  return NextResponse.json(
    {
      status: unhealthy ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      marketOpen,
      engines: {
        total: snapshots.length,
        running,
        halted,
        stalled,
        brokerDown,
      },
      oldestLastScanSec,
    },
    {
      status: unhealthy ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
