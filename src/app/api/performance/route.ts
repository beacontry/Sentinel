import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { signals, signalAccuracy } from "@/lib/db/schema";
import { eq, isNotNull, sql, desc } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Overall stats
    const [overall] = await db
      .select({
        totalSignals: sql<number>`count(*)`,
        correctSignals: sql<number>`count(*) filter (where ${signalAccuracy.wasCorrect} = true)`,
        avgReturn: sql<number>`avg(${signalAccuracy.actualReturn})`,
      })
      .from(signalAccuracy)
      .where(isNotNull(signalAccuracy.exitPrice));

    // By signal type
    const byType = await db
      .select({
        signalType: signals.signal,
        count: sql<number>`count(*)`,
        correct: sql<number>`count(*) filter (where ${signalAccuracy.wasCorrect} = true)`,
        avgReturn: sql<number>`avg(${signalAccuracy.actualReturn})`,
      })
      .from(signalAccuracy)
      .innerJoin(signals, eq(signalAccuracy.signalId, signals.id))
      .where(isNotNull(signalAccuracy.exitPrice))
      .groupBy(signals.signal);

    // By symbol (top performers)
    const bySymbol = await db
      .select({
        symbol: signals.symbol,
        count: sql<number>`count(*)`,
        correct: sql<number>`count(*) filter (where ${signalAccuracy.wasCorrect} = true)`,
        avgReturn: sql<number>`avg(${signalAccuracy.actualReturn})`,
      })
      .from(signalAccuracy)
      .innerJoin(signals, eq(signalAccuracy.signalId, signals.id))
      .where(isNotNull(signalAccuracy.exitPrice))
      .groupBy(signals.symbol)
      .orderBy(desc(sql`avg(${signalAccuracy.actualReturn})`))
      .limit(10);

    // Recent signal accuracy over time (weekly buckets)
    const weekly = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${signals.createdAt}), 'YYYY-MM-DD')`.as("week"),
        count: sql<number>`count(*)`,
        correct: sql<number>`count(*) filter (where ${signalAccuracy.wasCorrect} = true)`,
      })
      .from(signalAccuracy)
      .innerJoin(signals, eq(signalAccuracy.signalId, signals.id))
      .where(isNotNull(signalAccuracy.exitPrice))
      .groupBy(sql`date_trunc('week', ${signals.createdAt})`)
      .orderBy(sql`date_trunc('week', ${signals.createdAt})`);

    const totalSignals = Number(overall?.totalSignals ?? 0);
    const correctSignals = Number(overall?.correctSignals ?? 0);

    return NextResponse.json({
      overall: {
        totalSignals,
        correctSignals,
        accuracy: totalSignals > 0 ? correctSignals / totalSignals : 0,
        avgReturn: Number(overall?.avgReturn ?? 0),
      },
      byType: byType.map((t) => ({
        signalType: t.signalType,
        count: Number(t.count),
        correct: Number(t.correct),
        accuracy: Number(t.count) > 0 ? Number(t.correct) / Number(t.count) : 0,
        avgReturn: Number(t.avgReturn ?? 0),
      })),
      bySymbol: bySymbol.map((s) => ({
        symbol: s.symbol,
        count: Number(s.count),
        correct: Number(s.correct),
        accuracy: Number(s.count) > 0 ? Number(s.correct) / Number(s.count) : 0,
        avgReturn: Number(s.avgReturn ?? 0),
      })),
      weekly: weekly.map((w) => ({
        week: w.week,
        count: Number(w.count),
        correct: Number(w.correct),
        winRate: Number(w.count) > 0 ? Number(w.correct) / Number(w.count) : 0,
      })),
    }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Performance error:", message);
    return NextResponse.json({ error: "Failed to load performance" }, { status: 500 });
  }
}
