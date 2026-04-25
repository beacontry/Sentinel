import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { paperTradingConfigs, paperTradingRuns } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("paper-trading-detail");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { config, runs } = await withTimeout(3000, async (tx) => {
      const [cfg] = await tx
        .select()
        .from(paperTradingConfigs)
        .where(
          and(
            eq(paperTradingConfigs.id, id),
            eq(paperTradingConfigs.userId, session.userId as string)
          )
        )
        .limit(1);

      if (!cfg) {
        return { config: null, runs: [] };
      }

      const r = await tx
        .select()
        .from(paperTradingRuns)
        .where(eq(paperTradingRuns.configId, id))
        .orderBy(sql`${paperTradingRuns.startedAt} DESC`)
        .limit(20);

      return { config: cfg, runs: r };
    });

    if (!config) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(
      { config, runs },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Paper trading detail error");
    return NextResponse.json(
      { error: "Failed to load configuration" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const result = await db
      .delete(paperTradingConfigs)
      .where(
        and(
          eq(paperTradingConfigs.id, id),
          eq(paperTradingConfigs.userId, auth.userId as string)
        )
      )
      .returning({ id: paperTradingConfigs.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Paper trading delete error");
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 }
    );
  }
}
