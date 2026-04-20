import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { socialComments, socialPosts, users } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { createCommentSchema } from "@/lib/validators";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("social-comments");

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
      .orderBy(asc(socialComments.createdAt));

    return NextResponse.json({
      comments: comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Comments list error");
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

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

    const [comment] = await db
      .insert(socialComments)
      .values({
        userId: session.userId,
        postId,
        content: parsed.data.content,
      })
      .returning();

    return NextResponse.json(
      {
        comment: {
          ...comment,
          authorName: session.name,
          createdAt: comment.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Comment create error");
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
