import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { optimizationRuns } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("save-preset");

/**
 * POST /api/optimize/save-preset
 * Marks an optimization run as the "active" preset.
 * Clears isActive on all other runs, sets it on the selected one.
 * The engine and compare route read the active run first.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const runId = body.runId as string;
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    // Scope to the caller's own runs — without the userId predicate this was
    // an IDOR: any trader could pass another user's runId to read their tuned
    // bestParams (returned below) and flip its active flag.
    const [run] = await db
      .select()
      .from(optimizationRuns)
      .where(and(eq(optimizationRuns.id, runId), eq(optimizationRuns.userId, auth.userId)))
      .limit(1);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status !== "complete") {
      return NextResponse.json({ error: "Run is not complete" }, { status: 400 });
    }

    // The active preset is GLOBAL: the engine's _loadOptimizedParams() reads
    // `status=complete AND isActive=true LIMIT 1` with no userId into a single
    // module-level cache shared by every optimized-mode engine. So deactivate
    // ALL currently-active runs (not just the caller's) before activating the
    // chosen one — otherwise multiple users' active rows coexist and the
    // global LIMIT 1 lookup becomes nondeterministic. The SELECT above already
    // proved the caller owns `runId`, so this only activates their own run.
    await db
      .update(optimizationRuns)
      .set({ isActive: false })
      .where(eq(optimizationRuns.isActive, true));

    await db
      .update(optimizationRuns)
      .set({ isActive: true })
      .where(and(eq(optimizationRuns.id, runId), eq(optimizationRuns.userId, auth.userId)));

    log.info({ runId, params: run.bestParams }, "Saved optimization run as active preset");

    return NextResponse.json({
      message: "Saved as active optimized preset",
      params: run.bestParams,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: msg }, "Failed to save preset");
    return NextResponse.json({ error: "Failed to save preset" }, { status: 500 });
  }
}
