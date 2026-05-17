/**
 * External API usage tracking.
 *
 * Fire-and-forget aggregator. Every Groq / Finnhub call increments
 * counters in api_usage_log via UPSERT on (date, provider). Reads
 * aggregate via getUsageWindow().
 *
 * Why daily aggregate (not raw rows):
 *   - 100s of calls/hour means ~100k rows/year per provider — manageable but
 *     not free. Aggregating in code at write time saves the read-time
 *     COUNT/SUM and keeps the table tiny (~7 rows/year/provider).
 *   - Trade-off: lose per-second granularity. If you ever need that, switch
 *     to raw inserts + a daily rollup job.
 *
 * Failures are silent — we'd rather lose a usage data-point than break
 * an actual user request because the metrics table was unavailable.
 */

import { eq, and, gte, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiUsageLog } from "@/lib/db/schema/api-usage";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("api-usage");

export type ApiProvider = "groq" | "finnhub" | "yahoo" | "alpaca";

interface RecordOptions {
  /** Tokens consumed (Groq only). Defaults to 0 for non-LLM providers. */
  tokensUsed?: number;
  /** True if this call resulted in an error (4xx/5xx). Defaults to false. */
  error?: boolean;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record one API call. Fire-and-forget: returns a Promise but errors
 * are logged + swallowed. Safe to `await` or to drop without `.catch`.
 */
export async function recordApiUsage(
  provider: ApiProvider,
  opts: RecordOptions = {}
): Promise<void> {
  const tokensUsed = Math.max(0, Math.floor(opts.tokensUsed ?? 0));
  const errorDelta = opts.error ? 1 : 0;
  const today = todayUtc();

  try {
    await db
      .insert(apiUsageLog)
      .values({
        date: today,
        provider,
        requestCount: 1,
        tokensUsed,
        errorCount: errorDelta,
      })
      .onConflictDoUpdate({
        target: [apiUsageLog.date, apiUsageLog.provider],
        set: {
          requestCount: sql`${apiUsageLog.requestCount} + 1`,
          tokensUsed: sql`${apiUsageLog.tokensUsed} + ${tokensUsed}`,
          errorCount: sql`${apiUsageLog.errorCount} + ${errorDelta}`,
          lastAt: new Date(),
        },
      });
  } catch (err) {
    // Never surface this to callers — usage tracking is best-effort.
    const message = err instanceof Error ? err.message : "Unknown error";
    log.warn({ err: message, provider }, "Failed to record API usage");
  }
}

export interface UsageDayRow {
  date: string;
  provider: string;
  requestCount: number;
  tokensUsed: number;
  errorCount: number;
  firstAt: string;
  lastAt: string;
}

/**
 * Fetch the last N days of usage. Default 30 days. Returns sorted
 * newest-first.
 */
export async function getUsageWindow(daysBack: number = 30): Promise<UsageDayRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(apiUsageLog)
    .where(gte(apiUsageLog.date, sinceStr))
    .orderBy(desc(apiUsageLog.date), apiUsageLog.provider);

  return rows.map((r) => ({
    date: r.date,
    provider: r.provider,
    requestCount: r.requestCount,
    tokensUsed: r.tokensUsed,
    errorCount: r.errorCount,
    firstAt: r.firstAt.toISOString(),
    lastAt: r.lastAt.toISOString(),
  }));
}

/**
 * Quick-summary: today + last-7-day rollup for the admin dashboard hero.
 */
export async function getUsageSummary(): Promise<{
  today: Array<{ provider: string; requestCount: number; tokensUsed: number; errorCount: number }>;
  last7Days: Array<{ provider: string; requestCount: number; tokensUsed: number; errorCount: number }>;
}> {
  const today = todayUtc();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6); // inclusive of today = 7 calendar days
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const todayRows = await db
    .select({
      provider: apiUsageLog.provider,
      requestCount: apiUsageLog.requestCount,
      tokensUsed: apiUsageLog.tokensUsed,
      errorCount: apiUsageLog.errorCount,
    })
    .from(apiUsageLog)
    .where(eq(apiUsageLog.date, today));

  const last7Rows = await db
    .select({
      provider: apiUsageLog.provider,
      requestCount: sql<number>`SUM(${apiUsageLog.requestCount})::int`,
      tokensUsed: sql<number>`SUM(${apiUsageLog.tokensUsed})::bigint`,
      errorCount: sql<number>`SUM(${apiUsageLog.errorCount})::int`,
    })
    .from(apiUsageLog)
    .where(and(gte(apiUsageLog.date, sevenDaysAgoStr)))
    .groupBy(apiUsageLog.provider);

  return {
    today: todayRows.map((r) => ({
      provider: r.provider,
      requestCount: r.requestCount,
      tokensUsed: Number(r.tokensUsed),
      errorCount: r.errorCount,
    })),
    last7Days: last7Rows.map((r) => ({
      provider: r.provider,
      requestCount: r.requestCount,
      tokensUsed: Number(r.tokensUsed),
      errorCount: r.errorCount,
    })),
  };
}
