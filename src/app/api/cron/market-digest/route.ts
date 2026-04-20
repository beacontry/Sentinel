import { NextRequest, NextResponse } from "next/server";
import { getClaudeClient } from "@/lib/claude";
import { gatherMarketContext } from "@/lib/market-context";
import { db } from "@/lib/db";
import { marketDigests, users, discordWebhooks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("cron-market-digest");

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claude = getClaudeClient();
  if (!claude.isConfigured) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Check if already generated today
    const [existing] = await db
      .select()
      .from(marketDigests)
      .where(eq(marketDigests.date, today))
      .limit(1);

    if (existing) {
      return NextResponse.json({ status: "already_generated", date: today });
    }

    // Gather context and generate (bypass rate limit for cron)
    const context = await gatherMarketContext();
    const result = await claude.generateMarketDigest(context, true);

    // Persist
    await db.insert(marketDigests).values({
      date: today,
      summary: result.summary,
      watchlistSymbols: context.recentSignals?.map((s: { symbol: string }) => s.symbol) ?? [],
      newsContext: context.news ?? [],
      signalContext: context.recentSignals ?? [],
    });

    // Send notifications to all users with Discord webhooks
    const webhooks = await db
      .select({ webhookUrl: discordWebhooks.webhookUrl })
      .from(discordWebhooks)
      .where(eq(discordWebhooks.enabled, true));

    let notified = 0;
    for (const wh of webhooks) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          await fetch(wh.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: "Sentinel",
              embeds: [{
                title: `Daily Market Digest — ${today}`,
                description: result.summary.slice(0, 4000),
                color: 0x3b82f6,
                footer: { text: "Sentinel AI Market Intelligence" },
                timestamp: new Date().toISOString(),
              }],
            }),
            signal: controller.signal,
          });
          notified++;
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // Best-effort delivery
      }
    }

    // Push notifications
    const allUsers = await db.select({ id: users.id }).from(users);
    for (const user of allUsers) {
      try {
        const { sendPushToUser } = await import("@/lib/push");
        await sendPushToUser(user.id, {
          title: "Daily Market Digest",
          body: result.summary.slice(0, 200) + "...",
          url: "/dashboard",
        }).catch(() => {});
      } catch {
        // Push module may not be available
      }
    }

    return NextResponse.json({
      status: "generated",
      date: today,
      tokensUsed: result.tokensUsed,
      notifiedWebhooks: notified,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Market digest cron error");
    return NextResponse.json(
      { error: "Digest generation failed" },
      { status: 500 }
    );
  }
}
