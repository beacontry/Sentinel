/**
 * Phase 18 — AI-generated trade journal entry.
 *
 * POST /api/trader/summarize-trade
 *   body: { tradeId: uuid }
 *
 * Looks up the trader_trades row (scoped to caller's userId), pairs SELLs
 * with their FIFO BUY entry, sends both to Claude with the engine's signal
 * + P&L context, returns a 1-2 sentence summary. Caches the result on
 * trader_trades.ai_summary so subsequent calls are instant.
 *
 * Anthropic SDK guidance:
 *  - Use claude-haiku-4-5 — this is structured short-form generation, no
 *    reasoning required, haiku is plenty.
 *  - max_tokens 200 (one short paragraph).
 *  - Cache on row, never regenerate unless explicitly asked.
 *
 * Cost note: every Summarize click is one API call. Frontend should
 * disable the button once a summary exists; user clicks "regenerate"
 * explicitly if they want a fresh one.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { traderTrades } from "@/lib/db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("trader/summarize-trade");

const schema = z.object({
  tradeId: z.string().uuid(),
  regenerate: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI summaries require ANTHROPIC_API_KEY in server environment" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const trade = await withTimeout(3000, async (tx) => {
      const [row] = await tx
        .select()
        .from(traderTrades)
        .where(and(eq(traderTrades.id, parsed.data.tradeId), eq(traderTrades.userId, auth.userId)))
        .limit(1);
      return row;
    });

    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    // Cache hit — return existing summary unless regenerate requested
    if (trade.aiSummary && !parsed.data.regenerate) {
      return NextResponse.json({
        tradeId: trade.id,
        summary: trade.aiSummary,
        generatedAt: trade.aiSummaryGeneratedAt?.toISOString() ?? null,
        cached: true,
      });
    }

    // For SELLs, find the most recent prior BUY for the same symbol (FIFO
    // approximation — for the trade journal, we only care about the most
    // recent entry context, not exact lot matching)
    let entryTrade: typeof trade | null = null;
    if (trade.action === "SELL" || trade.action === "manual_close") {
      const [prevBuy] = await withTimeout(3000, async (tx) => {
        return tx
          .select()
          .from(traderTrades)
          .where(
            and(
              eq(traderTrades.userId, auth.userId),
              eq(traderTrades.symbol, trade.symbol),
              eq(traderTrades.action, "BUY"),
              eq(traderTrades.status, "FILLED"),
              lt(traderTrades.traderTimestamp, trade.traderTimestamp)
            )
          )
          .orderBy(desc(traderTrades.traderTimestamp))
          .limit(1);
      });
      entryTrade = prevBuy ?? null;
    }

    // Build the prompt context
    const heldDays = entryTrade
      ? (trade.traderTimestamp.getTime() - entryTrade.traderTimestamp.getTime()) / (24 * 60 * 60 * 1000)
      : null;

    const context = [
      `Symbol: ${trade.symbol}`,
      `Action: ${trade.action}`,
      `Quantity: ${trade.quantity}`,
      `Fill price: ${trade.fillPrice ? "$" + trade.fillPrice.toFixed(2) : "pending"}`,
      `Signal that triggered: ${trade.signal}`,
      `Status: ${trade.status}`,
      trade.pnl != null ? `Realized P&L: ${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}` : null,
      trade.notes ? `Notes: ${trade.notes}` : null,
      entryTrade
        ? `Entry context: bought ${entryTrade.quantity} shares at $${entryTrade.fillPrice?.toFixed(2) ?? "?"} on ${entryTrade.traderTimestamp.toISOString().slice(0, 10)} via signal "${entryTrade.signal}". Held ${heldDays?.toFixed(0)} days.`
        : null,
    ].filter(Boolean).join("\n");

    const prompt = `Summarize this single trade in 1-2 plain-English sentences for a trade journal. Be specific about the entry/exit reasoning, hold period, and outcome. No financial advice, no disclaimers. Just describe what happened.

${context}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    if (!summary) {
      log.warn({ tradeId: trade.id }, "Anthropic returned empty summary");
      return NextResponse.json({ error: "AI returned empty summary" }, { status: 502 });
    }

    const now = new Date();
    await db
      .update(traderTrades)
      .set({ aiSummary: summary, aiSummaryGeneratedAt: now })
      .where(eq(traderTrades.id, trade.id));

    return NextResponse.json({
      tradeId: trade.id,
      summary,
      generatedAt: now.toISOString(),
      cached: false,
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Query timed out" }, { status: 504 });
    }
    const msg = err instanceof Error ? err.message : "unknown";
    log.error({ err: msg, userId: auth.userId, tradeId: parsed.data.tradeId }, "Trade summarize failed");
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
