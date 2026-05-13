/**
 * Journal v2 — phase 1: auto-stub generation on filled trades.
 *
 * Called from the engine's reconcilePendingTrades() function whenever
 * a trader_trades row transitions from PENDING → FILLED. Creates a
 * journal entry pre-filled with the mechanics of the trade so the
 * user only has to add the WHY (thesis, emotion, lesson).
 *
 * Idempotent via the partial unique index `journal_auto_trade_uniq`
 * on (user_id, trader_trade_id) WHERE type='auto-trade' — ON CONFLICT
 * DO NOTHING never throws. Safe to call repeatedly.
 *
 * Never throws: if any part of stub generation fails, log + return.
 * The journal stub is a quality-of-life add, NOT a correctness
 * requirement — we never want it to break the reconciler.
 */

import { db } from "./db";
import { tradeJournal } from "./db/schema";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("journal-auto-stub");

interface AutoStubInput {
  userId: string;
  traderTradeId: string;
  symbol: string;
  action: "BUY" | "SELL" | "manual_close" | string;
  signal: string;
  quantity: number;
  fillPrice: number | null;
  pnl: number | null;
}

export async function createAutoJournalStub(input: AutoStubInput): Promise<void> {
  try {
    const { userId, traderTradeId, symbol, action, signal, quantity, fillPrice, pnl } = input;

    const isExit = action === "SELL" || action === "manual_close";
    const title = isExit
      ? `${symbol} closed${pnl != null ? ` (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)})` : ""}`
      : `${symbol} entry`;

    const notes = buildStubNotes({
      symbol,
      action,
      signal,
      quantity,
      fillPrice,
      pnl,
      isExit,
    });

    await db
      .insert(tradeJournal)
      .values({
        userId,
        symbol,
        title,
        notes,
        tags: [],
        traderTradeId,
        type: "auto-trade",
      })
      .onConflictDoNothing();

    log.debug({ userId, symbol, traderTradeId, action }, "Auto-journal stub created");
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", traderTradeId: input.traderTradeId },
      "Failed to create auto-journal stub (non-fatal)"
    );
  }
}

/**
 * Pre-filled notes template. Includes the trade mechanics + a leading
 * prompt for the user to fill in. Markdown-formatted so it renders
 * cleanly in the existing journal viewer.
 */
function buildStubNotes(opts: {
  symbol: string;
  action: string;
  signal: string;
  quantity: number;
  fillPrice: number | null;
  pnl: number | null;
  isExit: boolean;
}): string {
  const { symbol, action, signal, quantity, fillPrice, pnl, isExit } = opts;
  const priceStr = fillPrice != null ? `$${fillPrice.toFixed(2)}` : "(pending)";
  const pnlStr =
    pnl != null
      ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`
      : "n/a";

  const lines: string[] = [];

  lines.push("**Auto-generated stub. Add your reflection below.**");
  lines.push("");
  lines.push(`- Symbol: ${symbol}`);
  lines.push(`- Action: ${action}`);
  lines.push(`- Signal: ${signal}`);
  lines.push(`- Quantity: ${quantity}`);
  lines.push(`- Fill price: ${priceStr}`);
  if (isExit) {
    lines.push(`- P&L: ${pnlStr}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  if (isExit) {
    lines.push("**What did I get right or wrong about this trade?**");
    lines.push("");
    lines.push("**What's the lesson?** (Useful to come back to.)");
  } else {
    lines.push("**Why am I taking this trade?** (Thesis, setup, conviction level.)");
    lines.push("");
    lines.push("**What invalidates the thesis?** (Concrete exit conditions.)");
  }

  return lines.join("\n");
}
