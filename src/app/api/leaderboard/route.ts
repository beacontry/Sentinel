import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { feedPosts, signals, signalAccuracy, users } from "@/lib/db/schema";
import { eq, sql, gte } from "drizzle-orm";
import type { LeaderboardEntry } from "@/types";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = Math.min(Math.max(Number(searchParams.get("period")) || 30, 1), 365);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);

    // Join feedPosts -> signals -> signalAccuracy -> users
    // Aggregate per user: total shared, measured, correct, accuracy, avgReturn
    const rows = await db
      .select({
        userId: feedPosts.userId,
        userName: users.name,
        totalShared: sql<number>`count(DISTINCT ${feedPosts.id})`,
        measuredSignals: sql<number>`count(*) filter (where ${signalAccuracy.exitPrice} is not null)`,
        correctSignals: sql<number>`count(*) filter (where ${signalAccuracy.wasCorrect} = true)`,
        avgReturn: sql<number>`avg(${signalAccuracy.actualReturn}) filter (where ${signalAccuracy.exitPrice} is not null)`,
      })
      .from(feedPosts)
      .innerJoin(users, eq(feedPosts.userId, users.id))
      .innerJoin(signals, eq(feedPosts.signalId, signals.id))
      .leftJoin(signalAccuracy, eq(signals.id, signalAccuracy.signalId))
      .where(gte(feedPosts.createdAt, cutoff))
      .groupBy(feedPosts.userId, users.name)
      .having(sql`count(*) filter (where ${signalAccuracy.exitPrice} is not null) >= 3`)
      .orderBy(
        sql`CASE WHEN count(*) filter (where ${signalAccuracy.exitPrice} is not null) > 0
            THEN count(*) filter (where ${signalAccuracy.wasCorrect} = true)::float / count(*) filter (where ${signalAccuracy.exitPrice} is not null)
            ELSE 0 END DESC`,
        sql`count(DISTINCT ${feedPosts.id}) DESC`
      )
      .limit(10);

    const entries: LeaderboardEntry[] = rows.map((row, idx) => {
      const measured = Number(row.measuredSignals);
      const correct = Number(row.correctSignals);
      const accuracy = measured > 0 ? correct / measured : 0;
      const rank = idx + 1;

      let badge: LeaderboardEntry["badge"] = null;
      if (accuracy >= 0.5) {
        if (rank === 1) badge = "gold";
        else if (rank <= 3) badge = "silver";
        else if (rank <= 10) badge = "bronze";
      }

      return {
        rank,
        userId: row.userId,
        userName: row.userName,
        totalShared: Number(row.totalShared),
        measuredSignals: measured,
        correctSignals: correct,
        accuracy,
        avgReturn: Number(row.avgReturn ?? 0),
        badge,
      };
    });

    return NextResponse.json(
      { entries, period },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Leaderboard error:", message);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}
