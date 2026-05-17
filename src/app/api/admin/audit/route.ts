import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { auditLog } from "@/lib/db/schema/audit";
import { users } from "@/lib/db/schema/users";
import { createRouteLogger } from "@/lib/logger";
import { desc, and, eq, sql, gt, lt, gte, lte, inArray, ilike } from "drizzle-orm";

const log = createRouteLogger("admin/audit");

const PAGE_SIZE = 100;

// Single source of truth for the CSV header. Both the empty-result and
// populated paths must emit the same column set so downstream importers
// don't break on zero-row exports.
const CSV_HEADER = "id,createdAt,actorUserId,actorEmail,actorRole,action,resourceType,resourceId,ip,userAgent,metadata,prevHash,hash";

/**
 * GET /api/admin/audit
 *
 * Query params (all optional):
 *   action      — exact action name (e.g. "engine.started")
 *   actorUserId — filter to actions by a specific user
 *   actorEmail  — partial-match (ILIKE %x%) on actor email; joined via users table
 *   resourceType — filter by resource type (e.g. "broker_connection")
 *   resourceId  — filter by resource id (used with resourceType)
 *   from        — ISO timestamp; filters createdAt >= from
 *   to          — ISO timestamp; filters createdAt <= to
 *   beforeId    — paginate by id < beforeId (for "older" page)
 *   afterId     — paginate by id > afterId (for "newer" page, useful for tailing)
 *   limit       — 1..500, default 100
 *   format      — "csv" returns text/csv stream (admin export); default JSON
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
  const actorEmail = url.searchParams.get("actorEmail");
  const resourceType = url.searchParams.get("resourceType");
  const resourceId = url.searchParams.get("resourceId");
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const beforeIdRaw = url.searchParams.get("beforeId");
  const afterIdRaw = url.searchParams.get("afterId");
  const limitRaw = url.searchParams.get("limit");
  const format = url.searchParams.get("format");

  // CSV export gets a larger default limit since it's the "give me everything
  // that matched" surface. Still capped at 5000 to keep the response bounded.
  const isCsv = format === "csv";
  const defaultLimit = isCsv ? 5000 : PAGE_SIZE;
  const maxLimit = isCsv ? 5000 : 500;
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? String(defaultLimit), 10) || defaultLimit, 1),
    maxLimit
  );
  const beforeId = beforeIdRaw ? parseInt(beforeIdRaw, 10) : null;
  const afterId = afterIdRaw ? parseInt(afterIdRaw, 10) : null;
  const fromDate = fromRaw ? new Date(fromRaw) : null;
  const toDate = toRaw ? new Date(toRaw) : null;

  try {
    // Resolve actor-email filter to a set of user IDs first (one extra query
    // but keeps the audit-log query single-table for the planner).
    let actorIdsFromEmail: string[] | null = null;
    if (actorEmail && actorEmail.length >= 2) {
      const matched = await withTimeout(3000, async (tx) => {
        return tx
          .select({ id: users.id })
          .from(users)
          .where(ilike(users.email, `%${actorEmail}%`))
          .limit(50);
      });
      actorIdsFromEmail = matched.map((m) => m.id);
      // No matching users → return empty results immediately (skip the AL query)
      if (actorIdsFromEmail.length === 0) {
        if (isCsv) {
          return new NextResponse(CSV_HEADER + "\n", {
            headers: csvHeaders(),
          });
        }
        return NextResponse.json({
          rows: [],
          pagination: { limit, returned: 0, oldestId: null, newestId: null, totalMatching: 0 },
        });
      }
    }

    const filters = [];
    if (action) filters.push(eq(auditLog.action, action));
    if (actorUserId) filters.push(eq(auditLog.actorUserId, actorUserId));
    if (actorIdsFromEmail) filters.push(inArray(auditLog.actorUserId, actorIdsFromEmail));
    if (resourceType) filters.push(eq(auditLog.resourceType, resourceType));
    if (resourceId) filters.push(eq(auditLog.resourceId, resourceId));
    if (fromDate && !isNaN(fromDate.getTime())) filters.push(gte(auditLog.createdAt, fromDate));
    if (toDate && !isNaN(toDate.getTime())) filters.push(lte(auditLog.createdAt, toDate));
    if (beforeId != null && Number.isFinite(beforeId)) filters.push(lt(auditLog.id, beforeId));
    if (afterId != null && Number.isFinite(afterId)) filters.push(gt(auditLog.id, afterId));

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const rows = await withTimeout(isCsv ? 10000 : 5000, async (tx) => {
      return tx
        .select()
        .from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.id))
        .limit(limit);
    });

    if (isCsv) {
      const csv = rowsToCsv(rows);
      return new NextResponse(csv, { headers: csvHeaders() });
    }

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

function csvHeaders(): HeadersInit {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="audit-log-${ts}.csv"`,
    // Cache-busting — every export is a point-in-time snapshot
    "Cache-Control": "no-store",
  };
}

/**
 * CSV serializer that escapes the dangerous fields. Metadata is stringified
 * JSON inside a quoted CSV cell — Excel/Sheets will display it verbatim,
 * downstream pipelines can JSON.parse it.
 */
function rowsToCsv(rows: Array<typeof auditLog.$inferSelect>): string {
  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt.toISOString(),
        csvCell(r.actorUserId),
        csvCell(r.actorEmail),
        csvCell(r.actorRole),
        csvCell(r.action),
        csvCell(r.resourceType),
        csvCell(r.resourceId),
        csvCell(r.ip),
        csvCell(r.userAgent),
        csvCell(r.metadata ? JSON.stringify(r.metadata) : ""),
        csvCell(r.prevHash),
        csvCell(r.hash),
      ].join(",")
    );
  }
  return lines.join("\n") + "\n";
}

function csvCell(v: string | null | undefined): string {
  if (v == null) return "";
  // RFC 4180: wrap in double-quotes, escape internal quotes by doubling.
  // Wrap anything that contains comma, quote, or newline.
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
