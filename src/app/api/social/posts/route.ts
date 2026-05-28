import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import {
  socialPosts,
  users,
} from "@/lib/db/schema";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("social-posts");
import { createSocialPostSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions = [];
    if (symbol) {
      conditions.push(eq(socialPosts.symbol, symbol.toUpperCase()));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const { total, posts } = await withTimeout(3000, async (tx) => {
      // Total count
      const [{ total: t }] = await tx
        .select({ total: count() })
        .from(socialPosts)
        .where(whereClause);

      // Posts with author, like count, comment count, and whether current user liked
      const p = await tx
        .select({
          id: socialPosts.id,
          content: socialPosts.content,
          symbol: socialPosts.symbol,
          sharedTrade: socialPosts.sharedTrade,
          createdAt: socialPosts.createdAt,
          userId: socialPosts.userId,
          authorName: users.name,
          likeCount: sql<number>`(
            SELECT count(*)::int FROM social_likes
            WHERE social_likes.post_id = ${socialPosts.id}
          )`,
          commentCount: sql<number>`(
            SELECT count(*)::int FROM social_comments
            WHERE social_comments.post_id = ${socialPosts.id}
          )`,
          liked: sql<boolean>`EXISTS(
            SELECT 1 FROM social_likes
            WHERE social_likes.post_id = ${socialPosts.id}
            AND social_likes.user_id = ${session.userId}
          )`,
        })
        .from(socialPosts)
        .innerJoin(users, eq(socialPosts.userId, users.id))
        .where(whereClause)
        .orderBy(desc(socialPosts.createdAt))
        .limit(limit)
        .offset(offset);

      return { total: t, posts: p };
    });

    return NextResponse.json({
      posts: posts.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Social posts list error");
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSocialPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Validated + key-stripped by the schema (no longer raw body) so the
    // jsonb column can't receive arbitrary unbounded client JSON.
    const sharedTrade = parsed.data.sharedTrade ?? null;

    const [post] = await db
      .insert(socialPosts)
      .values({
        userId: auth.userId,
        content: parsed.data.content,
        symbol: parsed.data.symbol?.toUpperCase() || null,
        sharedTrade,
      })
      .returning();

    return NextResponse.json(
      {
        post: {
          ...post,
          authorName: auth.name,
          likeCount: 0,
          commentCount: 0,
          liked: false,
          sharedTrade: post.sharedTrade,
          createdAt: post.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Social post create error");
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
