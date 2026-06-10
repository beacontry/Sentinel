import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// P2 audit (2026-06-09) — pre-fix this returned 200 OK without touching the
// database. Docker healthcheck would happily report the container "healthy"
// while every user request 500'd against a dead DB. Now does a cheap
// `SELECT 1` round-trip and returns 503 if it fails or runs > 1s.
//
// Cron callers (load balancer, container runtime) treat non-2xx as down.
export async function GET() {
  const startedAt = Date.now();
  try {
    const probe = (await Promise.race([
      db.execute(sql`SELECT 1 as ok`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db_timeout_1000ms")), 1000)
      ),
    ])) as unknown;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      dbLatencyMs: Date.now() - startedAt,
      probe: probe ? "ok" : "empty",
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 }
    );
  }
}
