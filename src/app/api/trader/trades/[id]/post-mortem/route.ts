/**
 * Trade post-mortem generation.
 *
 * POST /api/trader/trades/[id]/post-mortem
 *   body: { saveToJournal?: boolean }
 *
 * For a closing trade (SELL or manual_close) owned by the caller, finds the
 * matching prior BUY via FIFO, loads the entry signal context if linked,
 * calls Groq to produce a multi-paragraph post-mortem markdown, and
 * optionally saves it as a journal entry of type "auto-trade".
 *
 * Distinct from /api/trader/summarize-trade (1-2 sentence inline summary):
 * this is the multi-paragraph teaching document.
 *
 * Cost: one Groq call per request, ~600-800 tokens of output. The route
 * does NOT cache (caller can re-run to regenerate). Premium-tier gated.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { traderTrades, traderSignals, tradeJournal } from "@/lib/db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";
import { checkTier } from "@/lib/tiers-server";
import { getLlmApiKey } from "@/lib/system-config";
import {
  buildPostMortemContext,
  generatePostMortem,
  type PostMortemSignalRow,
} from "@/lib/post-mortem";

const log = createRouteLogger("trader/post-mortem");

const bodySchema = z
  .object({
    saveToJournal: z.boolean().optional().default(false),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "premium");
  if (tierFail) return tierFail;

  if (!(await getLlmApiKey())) {
    return NextResponse.json(
      { error: "LLM not configured — set GROQ_API_KEY in admin → System Config" },
      { status: 503 }
    );
  }

  const { id: tradeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(tradeId)) {
    return NextResponse.json({ error: "Invalid trade id" }, { status: 400 });
  }

  let body: unknown = {};
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    // Load the closing trade, scoped to caller.
    const closingTrade = await withTimeout(3000, async (tx) => {
      const [row] = await tx
        .select()
        .from(traderTrades)
        .where(
          and(eq(traderTrades.id, tradeId), eq(traderTrades.userId, auth.userId))
        )
        .limit(1);
      return row;
    });

    if (!closingTrade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (closingTrade.action !== "SELL" && closingTrade.action !== "manual_close") {
      return NextResponse.json(
        {
          error:
            "Post-mortems are generated on closing trades (SELL / manual_close), not entries.",
        },
        { status: 400 }
      );
    }

    if (closingTrade.fillPrice == null || closingTrade.fillTime == null) {
      return NextResponse.json(
        { error: "Trade is not fully filled yet — no fill price/time on record." },
        { status: 400 }
      );
    }

    // FIFO match: most recent prior BUY for same symbol/user that's FILLED.
    const [entryTrade] = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(traderTrades)
        .where(
          and(
            eq(traderTrades.userId, auth.userId),
            eq(traderTrades.symbol, closingTrade.symbol),
            eq(traderTrades.action, "BUY"),
            eq(traderTrades.status, "FILLED"),
            lt(traderTrades.traderTimestamp, closingTrade.traderTimestamp)
          )
        )
        .orderBy(desc(traderTrades.traderTimestamp))
        .limit(1);
    });

    if (!entryTrade) {
      return NextResponse.json(
        {
          error:
            "No matching BUY entry found for this closing trade — cannot build post-mortem.",
        },
        { status: 422 }
      );
    }

    if (entryTrade.fillPrice == null) {
      return NextResponse.json(
        { error: "Matched entry trade has no fill price recorded." },
        { status: 422 }
      );
    }

    // Optional: pull entry signal indicators if linked.
    let entrySignal: PostMortemSignalRow | null = null;
    if (entryTrade.signalId) {
      const [signalRow] = await withTimeout(3000, async (tx) => {
        return tx
          .select({
            signal: traderSignals.signal,
            indicators: traderSignals.indicators,
          })
          .from(traderSignals)
          .where(eq(traderSignals.id, entryTrade.signalId as string))
          .limit(1);
      });
      if (signalRow) {
        entrySignal = {
          signal: signalRow.signal,
          indicators: (signalRow.indicators ?? {}) as Record<string, unknown>,
        };
      }
    }

    const context = buildPostMortemContext(
      {
        id: entryTrade.id,
        symbol: entryTrade.symbol,
        action: entryTrade.action,
        quantity: entryTrade.quantity,
        fillPrice: entryTrade.fillPrice,
        fillTime: entryTrade.fillTime,
        stopPrice: entryTrade.stopPrice,
        status: entryTrade.status,
        signal: entryTrade.signal,
        notes: entryTrade.notes,
        traderTimestamp: entryTrade.traderTimestamp,
      },
      {
        id: closingTrade.id,
        symbol: closingTrade.symbol,
        action: closingTrade.action,
        quantity: closingTrade.quantity,
        fillPrice: closingTrade.fillPrice,
        fillTime: closingTrade.fillTime,
        stopPrice: closingTrade.stopPrice,
        status: closingTrade.status,
        signal: closingTrade.signal,
        notes: closingTrade.notes,
        traderTimestamp: closingTrade.traderTimestamp,
      },
      entrySignal
    );

    const result = await generatePostMortem(context);

    let journalEntryId: string | null = null;
    if (parsed.data.saveToJournal) {
      const pnlStr =
        (context.realizedPnl >= 0 ? "+" : "") +
        `$${context.realizedPnl.toFixed(2)}`;
      const title = `${context.symbol} post-mortem (${pnlStr})`;
      const tags = ["post-mortem", context.realizedPnl >= 0 ? "winner" : "loser"];

      const inserted = await db
        .insert(tradeJournal)
        .values({
          userId: auth.userId,
          symbol: context.symbol,
          title,
          notes: result.markdown,
          tags,
          traderTradeId: closingTrade.id,
          type: "auto-trade",
        })
        .onConflictDoUpdate({
          target: [tradeJournal.userId, tradeJournal.traderTradeId],
          set: {
            title,
            notes: result.markdown,
            tags,
            updatedAt: new Date(),
          },
        })
        .returning({ id: tradeJournal.id });
      journalEntryId = inserted[0]?.id ?? null;
    }

    log.info(
      {
        userId: auth.userId,
        tradeId: closingTrade.id,
        symbol: context.symbol,
        tokensUsed: result.tokensUsed,
        savedToJournal: journalEntryId !== null,
      },
      "post-mortem generated"
    );

    return NextResponse.json({
      tradeId: closingTrade.id,
      symbol: context.symbol,
      markdown: result.markdown,
      tokensUsed: result.tokensUsed,
      generatedAt: result.generatedAt,
      model: result.model,
      journalEntryId,
      context: {
        entryFillPrice: context.entryFillPrice,
        exitFillPrice: context.exitFillPrice,
        quantity: context.quantity,
        realizedPnl: context.realizedPnl,
        returnPct: context.returnPct,
        rMultiple: context.rMultiple,
        holdDurationDisplay: context.holdDurationDisplay,
      },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Query timed out" }, { status: 504 });
    }
    const msg = err instanceof Error ? err.message : "unknown";
    log.error(
      { err: msg, userId: auth.userId, tradeId },
      "Post-mortem generation failed"
    );
    return NextResponse.json(
      { error: "Failed to generate post-mortem" },
      { status: 500 }
    );
  }
}
