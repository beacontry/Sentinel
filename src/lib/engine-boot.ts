/**
 * Auto-restart trading engines for all users with active broker connections
 * on server startup. Runs once per container lifecycle — not per request.
 *
 * This ensures engines resume after a deploy/restart without waiting
 * for a user to open the dashboard.
 */

import { db } from "./db";
import { brokerConnections, traderStatus } from "./db/schema";
import { eq } from "drizzle-orm";
import { autoStartIfNeeded } from "./trading-engine";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("engine-boot");

const g = globalThis as typeof globalThis & { __engineBootDone?: boolean };

export async function bootEngines(): Promise<void> {
  if (g.__engineBootDone) return;
  g.__engineBootDone = true;

  try {
    // Find all users with active broker connections
    const connections = await db
      .select({ userId: brokerConnections.userId })
      .from(brokerConnections)
      .where(eq(brokerConnections.isActive, true));

    if (connections.length === 0) {
      log.info("No active broker connections — skipping engine boot");
      return;
    }

    const userIds = [...new Set(connections.map((c) => c.userId))];
    log.info({ users: userIds.length }, "Checking engines for auto-restart on boot");

    // Auto-start each user's engine in parallel
    const results = await Promise.allSettled(
      userIds.map(async (userId) => {
        try {
          await autoStartIfNeeded(userId);
        } catch (err) {
          log.error({ userId, err: err instanceof Error ? err.message : "unknown" }, "Failed to auto-start engine for user");
        }
      })
    );

    const started = results.filter((r) => r.status === "fulfilled").length;
    log.info({ checked: userIds.length, started }, "Engine boot complete");
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Engine boot failed");
  }
}
