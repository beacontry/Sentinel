import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
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
    const categories = await db
      .select({
        id: forumCategories.id,
        name: forumCategories.name,
        description: forumCategories.description,
        sortOrder: forumCategories.sortOrder,
        createdAt: forumCategories.createdAt,
        threadCount: sql<number>`(
          SELECT count(*)::int FROM forum_threads
          WHERE forum_threads.category_id = ${forumCategories.id}
        )`,
        replyCount: sql<number>`(
          SELECT count(*)::int FROM forum_replies
          WHERE forum_replies.thread_id IN (
            SELECT id FROM forum_threads WHERE forum_threads.category_id = ${forumCategories.id}
          )
        )`,
        lastThreadTitle: sql<string | null>`(
          SELECT ft.title FROM forum_threads ft
          WHERE ft.category_id = ${forumCategories.id}
          ORDER BY ft.created_at DESC LIMIT 1
        )`,
        lastThreadAuthor: sql<string | null>`(
          SELECT u.name FROM forum_threads ft
          JOIN users u ON u.id = ft.user_id
          WHERE ft.category_id = ${forumCategories.id}
          ORDER BY ft.created_at DESC LIMIT 1
        )`,
        lastActivityAt: sql<string | null>`(
          SELECT GREATEST(
            (SELECT max(ft2.created_at) FROM forum_threads ft2 WHERE ft2.category_id = ${forumCategories.id}),
            (SELECT max(fr.created_at) FROM forum_replies fr
             JOIN forum_threads ft3 ON ft3.id = fr.thread_id
             WHERE ft3.category_id = ${forumCategories.id})
          )::text
        )`,
      })
      .from(forumCategories)
      .orderBy(asc(forumCategories.sortOrder));

    return NextResponse.json({
      categories: categories.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Forum categories error");
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}
