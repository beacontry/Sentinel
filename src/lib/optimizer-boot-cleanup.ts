/**
 * Boot-time cleanup for orphaned optimizer runs.
 *
 * Optimizer GA runs live in the Node process — when the container
 * restarts (deploy, OOM, manual restart, crash) any run with
 * `status='optimizing'` is dead but its DB row keeps the running
 * status. The UI then shows a phantom in-progress run forever, and
 * the user can't start a new one because the Optimizer page gates
 * on at-most-one-active-run.
 *
 * The fix: on every server boot, scan for orphaned rows and mark
 * them `failed` with an explanatory error message.
 *
 * Threshold: 2 minutes old. Any row created < 2 min ago might be a
 * genuinely-in-flight run from a fresh container start where the
 * worker hasn't checked in yet — leave those alone. Anything older
 * is by definition dead because the previous process is gone.
 *
 * Safe to run on every boot:
 *   - Idempotent (only flips status='optimizing' rows, sets
 *     completed_at + error).
 *   - WHERE clause restricts to the stale set; never touches
 *     fresh runs.
 *   - Logs count; never throws.
 */

import { db } from "./db";
import { optimizationRuns } from "./db/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("optimizer-boot-cleanup");

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export async function cleanupOrphanedOptimizerRuns(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    const result = await db
      .update(optimizationRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: "Orphaned by container restart — process holding the GA run was killed before completion. Start a new run.",
      })
      .where(
        and(
          eq(optimizationRuns.status, "optimizing"),
          isNotNull(optimizationRuns.startedAt),
          lt(optimizationRuns.startedAt, cutoff)
        )
      )
      .returning({ id: optimizationRuns.id });

    if (result.length > 0) {
      log.info(
        { count: result.length, ids: result.map((r) => r.id) },
        "Cleaned up orphaned optimizer runs at boot"
      );
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "Optimizer boot cleanup failed (non-critical)"
    );
  }
}
