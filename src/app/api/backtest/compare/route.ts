// GET /api/backtest/compare?ids=a,b,c
//
// Returns the lastResult for each saved strategy id in the comma list,
// scoped to the caller. Used by /dashboard/backtest/compare to render
// side-by-side stats + equity curves.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { savedStrategies } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("backtest-compare");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    .slice(0, 5); // cap at 5 to keep the UI from getting overwhelming

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Provide ?ids=<uuid>,<uuid>" },
      { status: 400 }
    );
  }

  try {
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          id: savedStrategies.id,
          name: savedStrategies.name,
          description: savedStrategies.description,
          config: savedStrategies.config,
          lastRunAt: savedStrategies.lastRunAt,
          lastResult: savedStrategies.lastResult,
        })
        .from(savedStrategies)
        .where(
          and(
            eq(savedStrategies.userId, session.userId),
            inArray(savedStrategies.id, ids)
          )
        );
    });

    // Preserve the order of the requested ids — DB results come in any order
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter((r) => r != null);

    return NextResponse.json(
      { strategies: ordered },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Compare error");
    return NextResponse.json({ error: "Failed to load strategies" }, { status: 500 });
  }
}
