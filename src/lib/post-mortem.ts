/**
 * Trade post-mortem generator.
 *
 * For a closed position (BUY + later SELL/manual_close on the same symbol),
 * builds a long-form AI-written analysis: what was the setup at entry, what
 * went right or wrong, what's the lesson. Saved as a journal entry of
 * type "auto-trade" so it appears in the existing journal feed.
 *
 * Distinct from /api/trader/summarize-trade, which generates a 1-2 sentence
 * inline summary cached on traderTrades.aiSummary. The post-mortem is the
 * multi-paragraph teaching document; the summary is the row caption.
 *
 * Position matching uses the same FIFO approximation as the existing
 * summarize-trade route: pair the closing fill with the most recent prior
 * BUY for the same symbol/user. Partial fills and overlapping positions
 * fall back to the most-recent-open rule — flagged for future work but
 * adequate for v1.
 *
 * MFE/MAE deferred: would require replaying intraday bars between entry
 * and exit. The current report uses realized P&L and R-multiple (when a
 * stop price was captured at entry).
 */

import { groqChat } from "@/lib/claude";
import { CLAUDE_CONFIG } from "@/lib/config";

// ── Input shapes (loose so route can pass DB rows directly) ────────

export interface PostMortemTradeRow {
  id: string;
  symbol: string;
  action: string;
  quantity: number;
  fillPrice: number | null;
  fillTime: Date | null;
  stopPrice: number | null;
  status: string;
  signal: string;
  notes: string | null;
  traderTimestamp: Date;
}

export interface PostMortemSignalRow {
  signal: string;
  indicators: Record<string, unknown>;
}

// ── Output shape ───────────────────────────────────────────────────

export interface PostMortemContext {
  symbol: string;
  /** Direction inferred from the closing action: "long" (BUY→SELL) is the only supported case in v1. */
  direction: "long";
  entryFillPrice: number;
  exitFillPrice: number;
  quantity: number;
  entrySignal: string;
  exitSignal: string;
  entryTime: Date;
  exitTime: Date;
  /** Hold duration in milliseconds. */
  holdDurationMs: number;
  /** Human display like "2h 15m" or "3d 4h". */
  holdDurationDisplay: string;
  /** Realized P&L in dollars. */
  realizedPnl: number;
  /** (exit - entry) / entry, as a fraction. Always sign-consistent with P&L. */
  returnPct: number;
  /** R-multiple = P&L / initial risk. Null if entry had no stop price recorded. */
  rMultiple: number | null;
  /** Per-share initial risk (entry - stop). Null if no stop captured. */
  riskPerShare: number | null;
  /** Free-text notes attached to the closing trade, if any. */
  notes: string | null;
  /** Signal-time indicator snapshot from the entry signal row, if linked. */
  entrySignalDetails: PostMortemSignalRow | null;
}

export interface PostMortemPrompt {
  system: string;
  user: string;
}

export interface PostMortemResult {
  markdown: string;
  tokensUsed: number;
  generatedAt: string;
  model: string;
}

// ── Pure helpers ───────────────────────────────────────────────────

export function formatDuration(ms: number): string {
  if (ms < 0) return "0m";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function computeRMultiple(
  entryPrice: number,
  stopPrice: number | null,
  exitPrice: number,
  quantity: number
): { rMultiple: number | null; riskPerShare: number | null } {
  if (stopPrice === null || !(stopPrice > 0)) {
    return { rMultiple: null, riskPerShare: null };
  }
  const riskPerShare = entryPrice - stopPrice;
  // Stop above entry on a long position is malformed — bail rather than
  // return a confusing negative R-multiple.
  if (!(riskPerShare > 0)) return { rMultiple: null, riskPerShare: null };
  const pnl = (exitPrice - entryPrice) * quantity;
  const totalRisk = riskPerShare * quantity;
  return { rMultiple: pnl / totalRisk, riskPerShare };
}

// ── Context builder ────────────────────────────────────────────────

export function buildPostMortemContext(
  entryTrade: PostMortemTradeRow,
  exitTrade: PostMortemTradeRow,
  entrySignal: PostMortemSignalRow | null
): PostMortemContext {
  if (entryTrade.fillPrice === null || exitTrade.fillPrice === null) {
    throw new Error("Both entry and exit trades must have a fill price");
  }
  if (entryTrade.symbol !== exitTrade.symbol) {
    throw new Error(
      `Symbol mismatch: entry ${entryTrade.symbol} vs exit ${exitTrade.symbol}`
    );
  }

  const entryTime = entryTrade.fillTime ?? entryTrade.traderTimestamp;
  const exitTime = exitTrade.fillTime ?? exitTrade.traderTimestamp;
  const holdDurationMs = exitTime.getTime() - entryTime.getTime();
  const realizedPnl =
    (exitTrade.fillPrice - entryTrade.fillPrice) * exitTrade.quantity;
  const returnPct =
    (exitTrade.fillPrice - entryTrade.fillPrice) / entryTrade.fillPrice;

  const { rMultiple, riskPerShare } = computeRMultiple(
    entryTrade.fillPrice,
    entryTrade.stopPrice,
    exitTrade.fillPrice,
    exitTrade.quantity
  );

  return {
    symbol: exitTrade.symbol,
    direction: "long",
    entryFillPrice: entryTrade.fillPrice,
    exitFillPrice: exitTrade.fillPrice,
    quantity: exitTrade.quantity,
    entrySignal: entryTrade.signal,
    exitSignal: exitTrade.signal,
    entryTime,
    exitTime,
    holdDurationMs,
    holdDurationDisplay: formatDuration(holdDurationMs),
    realizedPnl,
    returnPct,
    rMultiple,
    riskPerShare,
    notes: exitTrade.notes,
    entrySignalDetails: entrySignal,
  };
}

// ── Prompt builder ─────────────────────────────────────────────────

function fmtIndicators(indicators: Record<string, unknown> | undefined): string {
  if (!indicators) return "(no indicator snapshot)";
  const interesting = [
    "rsi_14",
    "ema_9",
    "ema_21",
    "vwap",
    "atr_14",
    "macd_histogram",
  ];
  const parts: string[] = [];
  for (const key of interesting) {
    const v = indicators[key];
    if (typeof v === "number") {
      parts.push(`${key}=${v.toFixed(2)}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "(no relevant indicators)";
}

export function buildPostMortemPrompt(ctx: PostMortemContext): PostMortemPrompt {
  const winLoss = ctx.realizedPnl >= 0 ? "winner" : "loser";
  const pnlSign = ctx.realizedPnl >= 0 ? "+" : "-";
  const pnlStr = `${pnlSign}$${Math.abs(ctx.realizedPnl).toFixed(2)}`;
  const retSign = ctx.returnPct >= 0 ? "+" : "-";
  const retStr = `${retSign}${Math.abs(ctx.returnPct * 100).toFixed(2)}%`;
  const rStr =
    ctx.rMultiple === null
      ? "not computable (no stop price captured at entry)"
      : `${ctx.rMultiple >= 0 ? "+" : ""}${ctx.rMultiple.toFixed(2)}R`;

  const system = [
    "You are an experienced trading coach writing a post-mortem on a single closed trade.",
    "Be honest and specific. Treat winners and losers the same — both teach.",
    "Do NOT give financial advice. Do NOT add disclaimers. Do NOT recommend future trades.",
    "Output plain Markdown with these four sections in order:",
    "## Setup",
    "## What worked / what didn't",
    "## Stop and exit assessment",
    "## Lesson",
    "Each section: 2-4 sentences. Total target: ~250 words.",
  ].join("\n");

  const user = [
    `Symbol: ${ctx.symbol}`,
    `Direction: long`,
    `Quantity: ${ctx.quantity}`,
    `Entry: $${ctx.entryFillPrice.toFixed(2)} on ${ctx.entryTime.toISOString().slice(0, 16).replace("T", " ")} UTC, triggered by signal "${ctx.entrySignal}"`,
    `Exit: $${ctx.exitFillPrice.toFixed(2)} on ${ctx.exitTime.toISOString().slice(0, 16).replace("T", " ")} UTC, triggered by signal "${ctx.exitSignal}"`,
    `Hold duration: ${ctx.holdDurationDisplay}`,
    `Outcome: ${winLoss} — ${pnlStr} (${retStr}) — ${rStr}`,
    ctx.riskPerShare !== null
      ? `Initial risk per share: $${ctx.riskPerShare.toFixed(2)} (entry − stop)`
      : `Initial risk per share: unknown (no stop captured)`,
    `Entry indicator snapshot: ${fmtIndicators(ctx.entrySignalDetails?.indicators)}`,
    ctx.notes ? `Closing notes: ${ctx.notes}` : null,
    "",
    "Write the post-mortem.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { system, user };
}

// ── LLM caller ─────────────────────────────────────────────────────

export async function generatePostMortem(
  ctx: PostMortemContext
): Promise<PostMortemResult> {
  const { system, user } = buildPostMortemPrompt(ctx);
  const response = await groqChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    800
  );
  const markdown = (response.choices[0]?.message?.content ?? "").trim();
  if (!markdown) {
    throw new Error("LLM returned empty post-mortem");
  }
  return {
    markdown,
    tokensUsed: response.usage?.total_tokens ?? 0,
    generatedAt: new Date().toISOString(),
    model: CLAUDE_CONFIG.model,
  };
}
