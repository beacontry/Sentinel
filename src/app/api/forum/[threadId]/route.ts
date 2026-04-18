import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  forumThreads,
  forumReplies,
  forumCategories,
  users,
} from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  try {
    // Increment view count
    await db
      .update(forumThreads)
      .set({ viewCount: sql`${forumThreads.viewCount} + 1` })
      .where(eq(forumThreads.id, threadId));

    // Get thread with author and category
    const threadRows = await db
      .select({
        id: forumThreads.id,
        title: forumThreads.title,
        body: forumThreads.body,
        pinned: forumThreads.pinned,
        locked: forumThreads.locked,
        viewCount: forumThreads.viewCount,
        createdAt: forumThreads.createdAt,
        updatedAt: forumThreads.updatedAt,
        userId: forumThreads.userId,
        categoryId: forumThreads.categoryId,
        authorName: users.name,
        categoryName: forumCategories.name,
      })
      .from(forumThreads)
      .innerJoin(users, eq(forumThreads.userId, users.id))
      .innerJoin(forumCategories, eq(forumThreads.categoryId, forumCategories.id))
      .where(eq(forumThreads.id, threadId))
      .limit(1);

    if (threadRows.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const thread = threadRows[0];

    // Get all replies with authors (flat, client can nest by parentReplyId)
    const replies = await db
      .select({
        id: forumReplies.id,
        body: forumReplies.body,
        parentReplyId: forumReplies.parentReplyId,
        createdAt: forumReplies.createdAt,
        userId: forumReplies.userId,
        authorName: users.name,
      })
      .from(forumReplies)
      .innerJoin(users, eq(forumReplies.userId, users.id))
      .where(eq(forumReplies.threadId, threadId))
      .orderBy(asc(forumReplies.createdAt));

    return NextResponse.json({
      thread: {
        ...thread,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
      },
      replies: replies.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Forum thread error:", message);
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await db
      .select({ userId: forumThreads.userId })
      .from(forumThreads)
      .where(eq(forumThreads.id, threadId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing[0].userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === "string" && body.title.length > 0 && body.title.length <= 200) {
      updates.title = body.title;
    }
    if (typeof body.body === "string" && body.body.length > 0 && body.body.length <= 10000) {
      updates.body = body.body;
    }

    const [updated] = await db
      .update(forumThreads)
      .set(updates)
      .where(eq(forumThreads.id, threadId))
      .returning();

    return NextResponse.json({
      thread: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Forum thread update error:", message);
    return NextResponse.json({ error: "Failed to update thread" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  try {
    const existing = await db
      .select({ userId: forumThreads.userId })
      .from(forumThreads)
      .where(eq(forumThreads.id, threadId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing[0].userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(forumThreads).where(eq(forumThreads.id, threadId));

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Forum thread delete error:", message);
    return NextResponse.json({ error: "Failed to delete thread" }, { status: 500 });
  }
}
