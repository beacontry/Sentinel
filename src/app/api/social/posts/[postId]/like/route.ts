import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { socialLikes, socialPosts } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("social-like");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { postId } = await params;

  try {
    // Verify post exists
    const post = await db
      .select({ id: socialPosts.id })
      .from(socialPosts)
      .where(eq(socialPosts.id, postId))
      .limit(1);

    if (post.length === 0) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if already liked
    const existing = await db
      .select({ id: socialLikes.id })
      .from(socialLikes)
      .where(
        and(
          eq(socialLikes.userId, auth.userId),
          eq(socialLikes.postId, postId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Unlike
      await db
        .delete(socialLikes)
        .where(eq(socialLikes.id, existing[0].id));
    } else {
      // Like
      await db
        .insert(socialLikes)
        .values({
          userId: auth.userId,
          postId,
        });
    }

    // Get updated count
    const [{ likeCount }] = await db
      .select({ likeCount: count() })
      .from(socialLikes)
      .where(eq(socialLikes.postId, postId));

    return NextResponse.json({
      liked: existing.length === 0,
      likeCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Like toggle error");
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 });
  }
}
