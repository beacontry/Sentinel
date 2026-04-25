import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { policyItems } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { getPolicyItems, type PolicyStatus } from "@/lib/policy-tracker";

const log = createRouteLogger("policy");

const VALID_STATUSES: PolicyStatus[] = ["proposed", "committee", "passed", "enacted"];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const statusParam = searchParams.get("status");
  const sectorParam = searchParams.get("sector");

  try {
    // Try DB first
    const { countResult, rows } = await withTimeout(3000, async (tx) => {
      const [cr] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(policyItems);

      if (Number(cr?.count) > 0) {
        // Serve from DB
        let query = tx
          .select()
          .from(policyItems)
          .orderBy(desc(policyItems.lastUpdated))
          .$dynamic();

        if (statusParam && VALID_STATUSES.includes(statusParam as PolicyStatus)) {
          query = query.where(eq(policyItems.status, statusParam));
        }

        const r = await query;
        return { countResult: cr, rows: r };
      }

      return { countResult: cr, rows: null };
    });

    if (rows) {

      let items = rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status as PolicyStatus,
        summary: r.summary ?? "",
        affectedSectors: (r.affectedSectors ?? []) as string[],
        sourceUrl: r.sourceUrl,
        dateIntroduced: r.createdAt.toISOString().slice(0, 10),
        lastUpdated: r.lastUpdated ? r.lastUpdated.toISOString().slice(0, 10) : r.createdAt.toISOString().slice(0, 10),
      }));

      // Client-side sector filter (JSONB search would be complex)
      if (sectorParam) {
        const lower = sectorParam.toLowerCase();
        items = items.filter((p) =>
          p.affectedSectors.some((s) => s.toLowerCase().includes(lower))
        );
      }

      return NextResponse.json(
        { items, source: "database" },
        { headers: { "Cache-Control": "private, max-age=300" } }
      );
    }

    // Fallback to static data if DB is empty
    const filter: { status?: PolicyStatus; sector?: string } = {};
    if (statusParam && VALID_STATUSES.includes(statusParam as PolicyStatus)) {
      filter.status = statusParam as PolicyStatus;
    }
    if (sectorParam) {
      filter.sector = sectorParam;
    }

    const items = getPolicyItems(Object.keys(filter).length > 0 ? filter : undefined);

    return NextResponse.json(
      { items, source: "static" },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Policy fetch error");

    // Fallback to static on DB error
    const items = getPolicyItems();
    return NextResponse.json(
      { items, source: "static-fallback" },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  }
}
