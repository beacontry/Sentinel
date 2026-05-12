import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { forumCategories } from "@/lib/db/schema";
import { asc, sql } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("forum-categories");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const categories = await withTimeout(3000, async (tx) => {
      // Auto-seed categories if table is empty
      const countResult = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(forumCategories);

      if (Number(countResult[0]?.count) === 0) {
        await tx.insert(forumCategories).values([
          { name: "General Discussion", description: "Market chatter, news reactions, and anything trading-related.", sortOrder: 0 },
          { name: "Trade Ideas & Setups", description: "Share your trade setups, entries, targets, and stop levels.", sortOrder: 1 },
          { name: "Technical Analysis", description: "Chart patterns, indicator readings, and price action analysis.", sortOrder: 2 },
          { name: "Due Diligence", description: "Deep dives into fundamentals, earnings, and long-form research.", sortOrder: 3 },
          { name: "Options & Derivatives", description: "Options strategies, flow analysis, and derivatives discussion.", sortOrder: 4 },
          { name: "Earnings Plays", description: "Pre-earnings setups, post-earnings reactions, and earnings strategy.", sortOrder: 5 },
          { name: "Small Caps & Penny Stocks", description: "Micro and small cap opportunities and momentum plays.", sortOrder: 6 },
          { name: "Post-Mortems", description: "Review past trades — wins and losses. Lessons learned.", sortOrder: 7 },
          { name: "Beginner Corner", description: "New to trading? Ask questions and learn the basics.", sortOrder: 8 },
        ]);
        log.info("Auto-seeded forum categories");
      }

      // NOTE: the correlated reference to the outer category id is written as
      // a literal `forum_categories.id` rather than `${forumCategories.id}`
      // because drizzle's sql tag was compiling the interpolated column as a
      // bare unqualified "id", which collides with users.id / forum_threads.id
      // inside the inner subqueries that JOIN those tables. Postgres then
      // raises `column reference "id" is ambiguous` and the whole categories
      // endpoint returns 500, leaving the forum page with no boards and the
      // "New Thread" button disabled (gh issue surfaced 2026-05-12).
      return tx
        .select({
          id: forumCategories.id,
          name: forumCategories.name,
          description: forumCategories.description,
          sortOrder: forumCategories.sortOrder,
          createdAt: forumCategories.createdAt,
          threadCount: sql<number>`(
            SELECT count(*)::int FROM forum_threads
            WHERE forum_threads.category_id = forum_categories.id
          )`,
          replyCount: sql<number>`(
            SELECT count(*)::int FROM forum_replies
            WHERE forum_replies.thread_id IN (
              SELECT forum_threads.id FROM forum_threads WHERE forum_threads.category_id = forum_categories.id
            )
          )`,
          lastThreadTitle: sql<string | null>`(
            SELECT ft.title FROM forum_threads ft
            WHERE ft.category_id = forum_categories.id
            ORDER BY ft.created_at DESC LIMIT 1
          )`,
          lastThreadAuthor: sql<string | null>`(
            SELECT u.name FROM forum_threads ft
            JOIN users u ON u.id = ft.user_id
            WHERE ft.category_id = forum_categories.id
            ORDER BY ft.created_at DESC LIMIT 1
          )`,
          lastActivityAt: sql<string | null>`(
            SELECT GREATEST(
              (SELECT max(ft2.created_at) FROM forum_threads ft2 WHERE ft2.category_id = forum_categories.id),
              (SELECT max(fr.created_at) FROM forum_replies fr
               JOIN forum_threads ft3 ON ft3.id = fr.thread_id
               WHERE ft3.category_id = forum_categories.id)
            )::text
          )`,
        })
        .from(forumCategories)
        .orderBy(asc(forumCategories.sortOrder));
    });

    return NextResponse.json({
      categories: categories.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Forum categories error");
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}
