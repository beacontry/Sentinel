import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { alertHistory, alertRules } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { checkTier } from "@/lib/tiers-server";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("alerts-history");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const history = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          id: alertHistory.id,
          symbol: alertRules.symbol,
          indicatorField: alertRules.indicatorField,
          message: alertHistory.message,
          triggeredAt: alertHistory.triggeredAt,
        })
        .from(alertHistory)
        .innerJoin(alertRules, eq(alertHistory.ruleId, alertRules.id))
        .where(eq(alertRules.userId, session.userId as string))
        .orderBy(desc(alertHistory.triggeredAt))
        .limit(50);
    });

    return NextResponse.json({
      history: history.map((h) => ({
        ...h,
        triggeredAt: h.triggeredAt.toISOString(),
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Alert history list failed");
    return NextResponse.json({ error: "Failed to list alert history" }, { status: 500 });
  }
}

// Bulk dismiss — deletes every alert_history row belonging to alert_rules
// owned by the caller. Acknowledged-style soft-dismiss would need a schema
// change; hard delete is the simplest first step. Power users can recover
// noise tolerance by disabling overly-chatty rules in the editor above.
export async function DELETE(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  try {
    const userRuleIds = await db
      .select({ id: alertRules.id })
      .from(alertRules)
      .where(eq(alertRules.userId, auth.userId));
    if (userRuleIds.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }
    const ids = userRuleIds.map((r) => r.id);
    const result = await db
      .delete(alertHistory)
      .where(inArray(alertHistory.ruleId, ids))
      .returning({ id: alertHistory.id });
    return NextResponse.json({ success: true, deleted: result.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Alert history bulk-dismiss failed");
    return NextResponse.json({ error: "Failed to clear alert history" }, { status: 500 });
  }
}
