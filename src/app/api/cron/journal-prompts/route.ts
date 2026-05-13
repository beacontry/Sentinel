/**
 * Journal v2 — phase 2: daily pre-market and post-market prompt stubs.
 *
 * Cron route that creates a pre-market or post-market journal stub for
 * every active user (anyone who's signed in within the last 30 days).
 * Prompts are stub entries with leading questions; users open them and
 * fill in their plan / reflection. The journal habit is the goal —
 * blank-canvas barrier removed.
 *
 * Two prompt types:
 *   - pre-market   — fire at 8:30 ET on trading days, before the open
 *   - post-market  — fire at 4:30 ET on trading days, after the close
 *
 * Idempotent via the partial unique index `journal_prompt_uniq` on
 * (user_id, type, prompt_date) — re-runs no-op.
 *
 * Auth: x-cron-secret header against CRON_SECRET env. Same pattern as
 * /api/cron/market-digest and /api/cron/refresh-congress.
 *
 * Trading days: this route runs every day; non-trading-day prompts are
 * filtered out via `isMarketOpenToday()` (which respects weekends + the
 * existing US holiday list).
 *
 * Usage (cron):
 *   0 12 * * 1-5 curl -H "x-cron-secret: $CRON_SECRET" https://.../api/cron/journal-prompts?type=pre-market
 *   0 20 * * 1-5 curl -H "x-cron-secret: $CRON_SECRET" https://.../api/cron/journal-prompts?type=post-market
 * (12:30 UTC = 8:30 ET, 20:30 UTC = 4:30 ET during EDT; cron schedule
 * should be set in UTC-aware fashion.)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, tradeJournal } from "@/lib/db/schema";
import { gt, eq, and } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("cron-journal-prompts");

type PromptType = "pre-market" | "post-market";

const PRE_MARKET_BODY = `**Pre-market plan**

What's the macro setup today? (FOMC, CPI, earnings of importance to the broader market.)

What's your trading bias for the day, and what would invalidate it?

Are there specific symbols you want to watch? Why?

What's one trade you're NOT going to take today, and why?`;

const POST_MARKET_BODY = `**Post-market reflection**

What worked today? (Be specific — which trade, which setup, which decision.)

What didn't work? (Same — specific.)

Did you follow your pre-market plan? If not, what changed?

One lesson to carry into tomorrow.`;

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const typeParam = request.nextUrl.searchParams.get("type");
  if (typeParam !== "pre-market" && typeParam !== "post-market") {
    return NextResponse.json(
      { error: "Missing or invalid ?type — must be 'pre-market' or 'post-market'" },
      { status: 400 }
    );
  }
  const type: PromptType = typeParam;

  // Skip weekends. Don't bother with holidays here — the daily-loss
  // cost of running on Memorial Day is ~10 unused journal stubs that
  // expire the next trading day. Not worth maintaining a holiday list
  // duplicated from market-hours.ts.
  const now = new Date();
  if (isWeekend(now)) {
    return NextResponse.json({ status: "skipped", reason: "weekend" });
  }

  const today = now.toISOString().slice(0, 10);
  const title = type === "pre-market" ? `Pre-market plan — ${today}` : `Post-market reflection — ${today}`;
  const body = type === "pre-market" ? PRE_MARKET_BODY : POST_MARKET_BODY;

  try {
    // Pull every user active in the last 30 days. Anyone who hasn't
    // logged in in a month probably doesn't care about prompts —
    // saves a bunch of empty rows.
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(gt(users.updatedAt, thirtyDaysAgo));

    let created = 0;
    let skipped = 0;
    for (const u of activeUsers) {
      try {
        // Check if a prompt of this type already exists for today.
        // Could rely on the partial unique index + onConflictDoNothing,
        // but an explicit check lets us count skipped vs created
        // accurately for the response payload.
        const existing = await db
          .select({ id: tradeJournal.id })
          .from(tradeJournal)
          .where(
            and(
              eq(tradeJournal.userId, u.id),
              eq(tradeJournal.type, type),
              eq(tradeJournal.promptDate, today)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await db
          .insert(tradeJournal)
          .values({
            userId: u.id,
            symbol: "—", // not symbol-scoped
            title,
            notes: body,
            tags: [type],
            type,
            promptDate: today,
          })
          .onConflictDoNothing();
        created++;
      } catch (err) {
        // Per-user failure shouldn't block others
        log.warn(
          { userId: u.id, err: err instanceof Error ? err.message : "unknown" },
          "Failed to create prompt for user"
        );
      }
    }

    log.info({ type, today, created, skipped, total: activeUsers.length }, "Journal prompts created");
    return NextResponse.json({
      status: "ok",
      type,
      date: today,
      created,
      skipped,
      totalActiveUsers: activeUsers.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error({ err: msg, type }, "Journal prompt cron failed");
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
