import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getJobProgress } from "@/lib/optimizer";
import { db } from "@/lib/db";
import {
  optimizationRuns,
  optimizationGenerations,
  optimizationSymbolResults,
} from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [run] = await db
    .select()
    .from(optimizationRuns)
    .where(
      and(
        eq(optimizationRuns.id, id),
        eq(optimizationRuns.userId, session.userId)
      )
    )
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get live progress if running
  const liveProgress = getJobProgress(id);

  // Get generation history for convergence chart
  const generations = await db
    .select()
    .from(optimizationGenerations)
    .where(eq(optimizationGenerations.runId, id))
    .orderBy(asc(optimizationGenerations.generation));

  // Get per-symbol results (top and bottom performers)
  let symbolResults: typeof optimizationSymbolResults.$inferSelect[] = [];
  if (run.status === "complete") {
    symbolResults = await db
      .select()
      .from(optimizationSymbolResults)
      .where(eq(optimizationSymbolResults.runId, id))
      .orderBy(desc(optimizationSymbolResults.totalReturn));
  }

  const enrichedRun = liveProgress
    ? {
        ...run,
        symbolsFetched: liveProgress.symbolsFetched,
        currentGeneration: liveProgress.currentGeneration,
        bestFitness: liveProgress.bestFitness,
        liveParams: liveProgress.bestParams,
      }
    : run;

  return NextResponse.json(
    { run: enrichedRun, generations, symbolResults },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
