import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  socialPosts,
  socialComments,
  users,
} from "@/lib/db/schema";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("social-post-detail");
import { eq, sql } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId } = await params;

  try {
    const postRows = await db
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
      .where(eq(socialPosts.id, postId))
      .limit(1);

    if (postRows.length === 0) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const post = postRows[0];

    // Get comments
    const comments = await db
      .select({
        id: socialComments.id,
        content: socialComments.content,
        createdAt: socialComments.createdAt,
        userId: socialComments.userId,
        authorName: users.name,
      })
      .from(socialComments)
      .innerJoin(users, eq(socialComments.userId, users.id))
      .where(eq(socialComments.postId, postId))
      .orderBy(socialComments.createdAt);

    return NextResponse.json({
      post: {
        ...post,
        createdAt: post.createdAt.toISOString(),
      },
      comments: comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Social post detail error");
    return NextResponse.json({ error: "Failed to load post" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId } = await params;

  try {
    const existing = await db
      .select({ userId: socialPosts.userId })
      .from(socialPosts)
      .where(eq(socialPosts.id, postId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing[0].userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(socialPosts).where(eq(socialPosts.id, postId));

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Social post delete error");
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
