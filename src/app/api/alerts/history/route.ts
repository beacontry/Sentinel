import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { alertHistory, alertRules } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
