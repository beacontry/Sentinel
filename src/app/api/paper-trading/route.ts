import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { paperTradingConfigs } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("paper-trading");

const createConfigSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  strategyConfig: z.object({
    preset: z.enum(["conservative", "moderate", "aggressive", "day_trade", "swing"]),
    symbol: z
      .string()
      .min(1, "Symbol is required")
      .max(10)
      .transform((s) => s.toUpperCase().trim()),
    days: z.number().int().min(30).max(365).default(90),
  }),
  riskConfig: z.object({
    stopLossPct: z.number().min(0.005).max(0.2).default(0.02),
    takeProfitPct: z.number().min(0.005).max(0.5).default(0.03),
    trailingStopPct: z.number().min(0.005).max(0.2).default(0.015),
    holdPeriod: z.number().int().min(1).max(100).default(20),
  }),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const configs = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(paperTradingConfigs)
        .where(eq(paperTradingConfigs.userId, session.userId as string))
        .orderBy(sql`${paperTradingConfigs.createdAt} DESC`);
    });

    return NextResponse.json(
      { configs },
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
    log.error({ err: message }, "Paper trading list error");
    return NextResponse.json(
      { error: "Failed to load configurations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const [config] = await db
      .insert(paperTradingConfigs)
      .values({
        userId: auth.userId as string,
        name: parsed.data.name,
        strategyConfig: parsed.data.strategyConfig,
        riskConfig: parsed.data.riskConfig,
      })
      .returning();

    return NextResponse.json({ config }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Paper trading create error");
    return NextResponse.json(
      { error: "Failed to create configuration" },
      { status: 500 }
    );
  }
}
