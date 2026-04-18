import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { socialLikes, socialPosts } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
          eq(socialLikes.userId, session.userId),
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
          userId: session.userId,
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
    console.error("Like toggle error:", message);
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 });
  }
}
