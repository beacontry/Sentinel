/**
 * Journal v2 — phase 5: AI weekly review.
 *
 * Runs every Sunday at 5pm ET (22:00 UTC during EDT). For each active
 * user, pulls:
 *   - Trades closed in the last 7 days from trader_trades
 *   - Journal entries created in the last 7 days
 * Sends to Groq with a prompt that asks for a structured weekly
 * recap, then inserts the result as a 'weekly-review' journal entry.
 *
 * Auth: x-cron-secret header. Same pattern as other crons.
 *
 * Idempotent via the partial unique index
 *   journal_prompt_uniq(user_id, type, prompt_date)
 * — re-runs on the same Sunday no-op.
 *
 * Cost: ~$0.005 / user / week on Groq's llama-3.3-70b. Bounded by
 * `MAX_TRADES_IN_PROMPT` and `MAX_ENTRIES_IN_PROMPT` so prompts can't
 * blow up for power users.
 *
 * Schedule (UTC, droplet crontab):
 *   0 22 * * 0  /api/cron/journal-weekly-review
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, tradeJournal, traderTrades } from "@/lib/db/schema";
import { gt, eq, and, desc } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { safeCompare } from "@/lib/crypto";
import { groqChat } from "@/lib/claude";
import { getLlmApiKey } from "@/lib/system-config";

const log = createRouteLogger("cron-journal-weekly-review");

const MAX_TRADES_IN_PROMPT = 40;
const MAX_ENTRIES_IN_PROMPT = 30;
const REVIEW_MAX_TOKENS = 800;

const SYSTEM_PROMPT = `You are a trading-journal review assistant. The user has shared trades they closed this week plus their journal reflections. Produce a calm, specific, actionable weekly recap.

Structure your response in exactly these sections (markdown headings):

**Week in numbers** — total trades, wins/losses, net $ P&L, win rate, average winner, average loser. Two sentences max.

**What worked** — concrete patterns from this week's wins (NOT generic advice). Tie to specific trades by symbol when possible. 2-3 bullets.

**What didn't** — concrete patterns from losses or misses. Direct but not punitive. 2-3 bullets.

**Pattern across the week** — one paragraph identifying a thread, mood, or behavior that recurred. If you tag-track FOMO / discipline / patience and one shows up often, name it.

**One question for next week** — a single question for the user to sit with. Not advice.

Do not invent trades or tags that aren't in the data. If the data is sparse, say so plainly rather than padding. Never end with disclaimers about not being financial advice — those are inherited from the page footer.`;

interface TradeSummary {
  symbol: string;
  action: string;
  qty: number;
  fillPrice: number | null;
  pnl: number | null;
  filledAt: string;
}

interface EntrySummary {
  type: string;
  symbol: string;
  title: string;
  notes: string;
  tags: string[];
  createdAt: string;
}

function buildPrompt(trades: TradeSummary[], entries: EntrySummary[]): string {
  const tradeBlock = trades.length === 0
    ? "(no trades closed this week)"
    : trades
        .map(
          (t) =>
            `- ${t.filledAt.slice(0, 10)} ${t.action} ${t.qty} ${t.symbol} @ $${t.fillPrice?.toFixed(2) ?? "?"}${t.pnl != null ? ` → P&L ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : ""}`
        )
        .join("\n");

  const entryBlock = entries.length === 0
    ? "(no journal entries this week)"
    : entries
        .map(
          (e) =>
            `[${e.createdAt.slice(0, 10)} · ${e.type}${e.tags.length ? ` · tags: ${e.tags.join(", ")}` : ""}] ${e.title}\n${e.notes.length > 400 ? e.notes.slice(0, 400) + "…" : e.notes}`
        )
        .join("\n\n");

  return `## Trades closed this week\n${tradeBlock}\n\n## Journal entries this week\n${entryBlock}`;
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || !safeCompare(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = await getLlmApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "LLM not configured — set GROQ_API_KEY in admin → System Config" },
      { status: 503 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Active users only — anyone updated in the last 30 days.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(gt(users.updatedAt, thirtyDaysAgo));

    let generated = 0;
    let skipped = 0;
    let errored = 0;
    let totalTokens = 0;

    for (const u of activeUsers) {
      try {
        // Idempotency check — already wrote a weekly review today?
        const existing = await db
          .select({ id: tradeJournal.id })
          .from(tradeJournal)
          .where(
            and(
              eq(tradeJournal.userId, u.id),
              eq(tradeJournal.type, "weekly-review"),
              eq(tradeJournal.promptDate, today)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        // Pull the user's week — trades + journal entries.
        const trades = await db
          .select({
            symbol: traderTrades.symbol,
            action: traderTrades.action,
            qty: traderTrades.quantity,
            fillPrice: traderTrades.fillPrice,
            pnl: traderTrades.pnl,
            filledAt: traderTrades.fillTime,
          })
          .from(traderTrades)
          .where(
            and(
              eq(traderTrades.userId, u.id),
              eq(traderTrades.status, "FILLED"),
              gt(traderTrades.fillTime, sevenDaysAgo)
            )
          )
          .orderBy(desc(traderTrades.fillTime))
          .limit(MAX_TRADES_IN_PROMPT);

        const entries = await db
          .select({
            type: tradeJournal.type,
            symbol: tradeJournal.symbol,
            title: tradeJournal.title,
            notes: tradeJournal.notes,
            tags: tradeJournal.tags,
            createdAt: tradeJournal.createdAt,
          })
          .from(tradeJournal)
          .where(
            and(
              eq(tradeJournal.userId, u.id),
              gt(tradeJournal.createdAt, sevenDaysAgo)
            )
          )
          .orderBy(desc(tradeJournal.createdAt))
          .limit(MAX_ENTRIES_IN_PROMPT);

        // Don't bother generating a review if the user has nothing to
        // review — the prompt would just say "nothing happened" which
        // is noise.
        if (trades.length === 0 && entries.length === 0) {
          skipped++;
          continue;
        }

        const tradeSummaries: TradeSummary[] = trades.map((t) => ({
          symbol: t.symbol,
          action: t.action,
          qty: t.qty,
          fillPrice: t.fillPrice,
          pnl: t.pnl,
          filledAt: t.filledAt?.toISOString() ?? "",
        }));
        const entrySummaries: EntrySummary[] = entries.map((e) => ({
          type: e.type,
          symbol: e.symbol,
          title: e.title,
          notes: e.notes,
          tags: Array.isArray(e.tags) ? (e.tags as string[]) : [],
          createdAt: e.createdAt.toISOString(),
        }));

        const userPrompt = buildPrompt(tradeSummaries, entrySummaries);
        const response = await groqChat(
          [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          REVIEW_MAX_TOKENS
        );
        const text = response.choices[0]?.message?.content ?? "";
        totalTokens += response.usage?.total_tokens ?? 0;

        if (!text.trim()) {
          errored++;
          continue;
        }

        const weekStart = new Date(sevenDaysAgo);
        const titleLabel = `Weekly review — ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

        await db
          .insert(tradeJournal)
          .values({
            userId: u.id,
            symbol: "—",
            title: titleLabel,
            notes: text,
            tags: ["weekly-review"],
            type: "weekly-review",
            promptDate: today,
          })
          .onConflictDoNothing();
        generated++;
      } catch (err) {
        errored++;
        log.warn(
          { userId: u.id, err: err instanceof Error ? err.message : "unknown" },
          "Weekly review failed for user"
        );
      }
    }

    log.info(
      { generated, skipped, errored, totalTokens, totalUsers: activeUsers.length },
      "Weekly review cron completed"
    );
    return NextResponse.json({
      status: "ok",
      generated,
      skipped,
      errored,
      tokensUsed: totalTokens,
      totalUsers: activeUsers.length,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Weekly review cron failed");
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
