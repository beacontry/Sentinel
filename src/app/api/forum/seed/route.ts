import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { forumCategories } from "@/lib/db/schema";
import { createRouteLogger } from "@/lib/logger";
import { sql } from "drizzle-orm";

const log = createRouteLogger("forum-seed");

const CATEGORIES = [
  { name: "General Discussion", description: "Market chatter, news reactions, and anything trading-related that doesn't fit elsewhere.", sortOrder: 0 },
  { name: "Trade Ideas & Setups", description: "Share your trade setups, entries, targets, and stop levels. Show your chart work.", sortOrder: 1 },
  { name: "Technical Analysis", description: "Chart patterns, indicator readings, support/resistance levels, and price action analysis.", sortOrder: 2 },
  { name: "Due Diligence", description: "Deep dives into fundamentals, earnings, sector analysis, and long-form research.", sortOrder: 3 },
  { name: "Options & Derivatives", description: "Options strategies, flow analysis, unusual activity, and derivatives discussion.", sortOrder: 4 },
  { name: "Earnings Plays", description: "Pre-earnings setups, post-earnings reactions, and earnings season strategy.", sortOrder: 5 },
  { name: "Small Caps & Penny Stocks", description: "Micro and small cap opportunities, momentum plays, and high-risk setups.", sortOrder: 6 },
  { name: "Post-Mortems", description: "Review past trades — wins and losses. What went right, what went wrong, lessons learned.", sortOrder: 7 },
  { name: "Beginner Corner", description: "New to trading? Ask questions, learn basics, and get guidance from the community.", sortOrder: 8 },
];

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can seed
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    // Check if categories already exist
    const existing = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(forumCategories);

    if (Number(existing[0]?.count) > 0) {
      return NextResponse.json({ message: "Categories already exist", count: Number(existing[0].count) });
    }

    // Insert all categories
    await db.insert(forumCategories).values(CATEGORIES);

    log.info("Forum categories seeded");
    return NextResponse.json({ message: "Seeded", count: CATEGORIES.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Forum seed error");
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
