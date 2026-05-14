import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { startOptimization, getJobProgress, type OptimizationConfig } from "@/lib/optimizer";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { optimizationRuns } from "@/lib/db/schema";
import { eq, desc, count, and } from "drizzle-orm";
import { z } from "zod";
import { checkTier } from "@/lib/tiers-server";

const startSchema = z.object({
  populationSize: z.number().int().min(10).max(100).default(30),
  generations: z.number().int().min(5).max(100).default(25),
  trainPct: z.number().int().min(40).max(80).default(60),
  universe: z.enum(["top50", "top150", "sp500"]).default("top50"),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  const body = await request.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid configuration", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Check for already-running optimization
  const existing = await db
    .select({ id: optimizationRuns.id, status: optimizationRuns.status })
    .from(optimizationRuns)
    .where(eq(optimizationRuns.userId, auth.userId))
    .orderBy(desc(optimizationRuns.createdAt))
    .limit(1);

  if (existing.length > 0 && (existing[0].status === "pending" || existing[0].status === "fetching_data" || existing[0].status === "optimizing")) {
    return NextResponse.json(
      { error: "An optimization is already running", runId: existing[0].id },
      { status: 409 }
    );
  }

  const config: OptimizationConfig = parsed.data;
  const runId = await startOptimization(auth.userId, config);

  return NextResponse.json({ runId }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [runs, [{ total }]] = await withTimeout(5000, async (tx) => {
      const r = await tx
        .select()
        .from(optimizationRuns)
        .where(eq(optimizationRuns.userId, session.userId))
        .orderBy(desc(optimizationRuns.createdAt))
        .limit(20);
      const [t] = await tx
        .select({ total: count() })
        .from(optimizationRuns)
        .where(and(
          eq(optimizationRuns.userId, session.userId),
          eq(optimizationRuns.status, "complete"),
        ));
      return [r, [t]] as const;
    });

    // Enrich active runs with live progress
    const enriched = runs.map((run) => {
      const liveProgress = getJobProgress(run.id);
      if (liveProgress && (run.status === "fetching_data" || run.status === "optimizing" || run.status === "pending")) {
        return {
          ...run,
          symbolsFetched: liveProgress.symbolsFetched,
          currentGeneration: liveProgress.currentGeneration,
          bestFitness: liveProgress.bestFitness,
        };
      }
      return run;
    });

    return NextResponse.json({ runs: enriched, totalCompleted: total }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    return NextResponse.json({ error: "Failed to load optimization runs" }, { status: 500 });
  }
}
