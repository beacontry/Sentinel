import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { optimizationRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
    const [run] = await db
      .select()
      .from(optimizationRuns)
      .where(eq(optimizationRuns.id, runId))
      .limit(1);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status !== "complete") {
      return NextResponse.json({ error: "Run is not complete" }, { status: 400 });
    }

    // Deactivate all runs for this user, then activate the selected one
    await db
      .update(optimizationRuns)
      .set({ isActive: false })
      .where(eq(optimizationRuns.userId, auth.userId));

    await db
      .update(optimizationRuns)
      .set({ isActive: true })
      .where(eq(optimizationRuns.id, runId));

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
