import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getJobProgress } from "@/lib/optimizer";
import { withTimeout, isStatementTimeout } from "@/lib/db";
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

  try {
    const { run, generations, symbolResults } = await withTimeout(5000, async (tx) => {
      const [r] = await tx
        .select()
        .from(optimizationRuns)
        .where(
          and(
            eq(optimizationRuns.id, id),
            eq(optimizationRuns.userId, session.userId)
          )
        )
        .limit(1);

      if (!r) {
        return { run: null, generations: [], symbolResults: [] as typeof optimizationSymbolResults.$inferSelect[] };
      }

      // Get generation history for convergence chart
      const gens = await tx
        .select()
        .from(optimizationGenerations)
        .where(eq(optimizationGenerations.runId, id))
        .orderBy(asc(optimizationGenerations.generation));

      // Get per-symbol results (top and bottom performers)
      let symResults: typeof optimizationSymbolResults.$inferSelect[] = [];
      if (r.status === "complete") {
        symResults = await tx
          .select()
          .from(optimizationSymbolResults)
          .where(eq(optimizationSymbolResults.runId, id))
          .orderBy(desc(optimizationSymbolResults.totalReturn));
      }

      return { run: r, generations: gens, symbolResults: symResults };
    });

    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get live progress if running
    const liveProgress = getJobProgress(id);

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
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    return NextResponse.json({ error: "Failed to load optimization run" }, { status: 500 });
  }
}
