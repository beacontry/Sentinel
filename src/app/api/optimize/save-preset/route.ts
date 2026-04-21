import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { optimizationRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("save-preset");

/**
 * POST /api/optimize/save-preset
 * Marks an optimization run as the "active" preset.
 * The trading engine reads the latest completed run's bestParams,
 * so this just ensures that run is the most recent completed one.
 *
 * In the future this could write to a dedicated presets table.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    // Update completedAt to NOW so this becomes the "latest" completed run
    // that the engine reads from
    await db
      .update(optimizationRuns)
      .set({ completedAt: new Date() })
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
