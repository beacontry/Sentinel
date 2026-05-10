import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { auditLog } from "@/lib/db/schema/audit";
import { createRouteLogger } from "@/lib/logger";
import { desc, and, eq, sql, gt, lt } from "drizzle-orm";

const log = createRouteLogger("admin/audit");

const PAGE_SIZE = 100;

/**
 * GET /api/admin/audit
 *
 * Query params (all optional):
 *   action      — exact action name (e.g. "engine.started")
 *   actorUserId — filter to actions by a specific user
 *   resourceType — filter by resource type (e.g. "broker_connection")
 *   resourceId  — filter by resource id (used with resourceType)
 *   beforeId    — paginate by id < beforeId (for "older" page)
 *   afterId     — paginate by id > afterId (for "newer" page, useful for tailing)
 *   limit       — 1..500, default 100
 *
 * Returns rows newest-first with the hash + prev_hash so the UI can render
 * the chain visually. Admin-only.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const actorUserId = url.searchParams.get("actorUserId");
  const resourceType = url.searchParams.get("resourceType");
  const resourceId = url.searchParams.get("resourceId");
  const beforeIdRaw = url.searchParams.get("beforeId");
  const afterIdRaw = url.searchParams.get("afterId");
  const limitRaw = url.searchParams.get("limit");

  const limit = Math.min(Math.max(parseInt(limitRaw ?? "100", 10) || PAGE_SIZE, 1), 500);
  const beforeId = beforeIdRaw ? parseInt(beforeIdRaw, 10) : null;
  const afterId = afterIdRaw ? parseInt(afterIdRaw, 10) : null;

  try {
    const filters = [];
    if (action) filters.push(eq(auditLog.action, action));
    if (actorUserId) filters.push(eq(auditLog.actorUserId, actorUserId));
    if (resourceType) filters.push(eq(auditLog.resourceType, resourceType));
    if (resourceId) filters.push(eq(auditLog.resourceId, resourceId));
    if (beforeId != null && Number.isFinite(beforeId)) filters.push(lt(auditLog.id, beforeId));
    if (afterId != null && Number.isFinite(afterId)) filters.push(gt(auditLog.id, afterId));

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const rows = await withTimeout(5000, async (tx) => {
      return tx
        .select()
        .from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.id))
        .limit(limit);
    });

    const [{ count }] = await withTimeout(5000, async (tx) => {
      return tx
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(whereClause);
    });

    return NextResponse.json({
      rows,
      pagination: {
        limit,
        returned: rows.length,
        oldestId: rows.length > 0 ? rows[rows.length - 1].id : null,
        newestId: rows.length > 0 ? rows[0].id : null,
        totalMatching: count,
      },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to load audit log");
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}
