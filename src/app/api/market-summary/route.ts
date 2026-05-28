import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClaudeClient } from "@/lib/claude";
import { gatherMarketContext } from "@/lib/market-context";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("market-summary");
import { marketDigests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claude = getClaudeClient();
  if (!(await claude.isConfigured())) {
    return NextResponse.json({
      configured: false,
      summary: null,
      message: "LLM not configured — set GROQ_API_KEY in admin → System Config",
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Check DB cache first
    const [cached] = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(marketDigests)
        .where(eq(marketDigests.date, today))
        .limit(1);
    });

    if (cached) {
      return NextResponse.json({
        configured: true,
        cached: true,
        id: cached.id,
        date: cached.date,
        summary: cached.summary,
        generatedAt: cached.generatedAt.toISOString(),
      }, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }

    // Rate limit check
    if (!claude.canGenerateDigest()) {
      return NextResponse.json({
        configured: true,
        cached: false,
        summary: null,
        message: "Digest rate limited — try again later",
      }, { status: 429 });
    }

    // Gather context and generate
    const context = await gatherMarketContext();
    const result = await claude.generateMarketDigest(context);

    // Persist to DB. onConflictDoNothing because the existence check above +
    // this insert aren't atomic — a concurrent cron/user generation on the
    // same day (date is unique) could insert first. On conflict no row is
    // returned, so fall back to reading the row the other writer created.
    const [inserted] = await db
      .insert(marketDigests)
      .values({
        date: today,
        summary: result.summary,
        watchlistSymbols: context.recentSignals?.map((s: { symbol: string }) => s.symbol) ?? [],
        newsContext: context.news ?? [],
        signalContext: context.recentSignals ?? [],
      })
      .onConflictDoNothing()
      .returning();

    const row =
      inserted ??
      (await db.select().from(marketDigests).where(eq(marketDigests.date, today)).limit(1))[0];

    if (!row) {
      return NextResponse.json({ error: "Failed to generate digest" }, { status: 500 });
    }

    return NextResponse.json({
      configured: true,
      cached: false,
      id: row.id,
      date: row.date,
      summary: row.summary,
      generatedAt: row.generatedAt.toISOString(),
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Market summary error");
    return NextResponse.json(
      { error: "Failed to generate market summary" },
      { status: 500 }
    );
  }
}
