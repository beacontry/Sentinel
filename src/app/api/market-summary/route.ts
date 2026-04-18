import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClaudeClient } from "@/lib/claude";
import { gatherMarketContext } from "@/lib/market-context";
import { db } from "@/lib/db";
import { marketDigests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claude = getClaudeClient();
  if (!claude.isConfigured) {
    return NextResponse.json({
      configured: false,
      summary: null,
      message: "ANTHROPIC_API_KEY not configured",
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Check DB cache first
    const [cached] = await db
      .select()
      .from(marketDigests)
      .where(eq(marketDigests.date, today))
      .limit(1);

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

    // Persist to DB
    const [row] = await db
      .insert(marketDigests)
      .values({
        date: today,
        summary: result.summary,
        watchlistSymbols: context.recentSignals?.map((s: { symbol: string }) => s.symbol) ?? [],
        newsContext: context.news ?? [],
        signalContext: context.recentSignals ?? [],
      })
      .returning();

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
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Market summary error:", message);
    return NextResponse.json(
      { error: "Failed to generate market summary" },
      { status: 500 }
    );
  }
}
