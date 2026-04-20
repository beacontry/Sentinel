import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createForumReplySchema } from "@/lib/validators";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("forum-replies");

export async function POST(
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

  const parsed = createForumReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Verify thread exists and is not locked
    const thread = await db
      .select({ id: forumThreads.id, locked: forumThreads.locked })
      .from(forumThreads)
      .where(eq(forumThreads.id, threadId))
      .limit(1);

    if (thread.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    if (thread[0].locked) {
      return NextResponse.json({ error: "Thread is locked" }, { status: 403 });
    }

    // If parentReplyId provided, verify it belongs to this thread
    if (parsed.data.parentReplyId) {
      const parent = await db
        .select({ id: forumReplies.id })
        .from(forumReplies)
        .where(eq(forumReplies.id, parsed.data.parentReplyId))
        .limit(1);

      if (parent.length === 0) {
        return NextResponse.json({ error: "Parent reply not found" }, { status: 404 });
      }
    }

    const [reply] = await db
      .insert(forumReplies)
      .values({
        userId: session.userId,
        threadId,
        body: parsed.data.body,
        parentReplyId: parsed.data.parentReplyId ?? null,
      })
      .returning();

    // Update thread's updatedAt
    await db
      .update(forumThreads)
      .set({ updatedAt: new Date() })
      .where(eq(forumThreads.id, threadId));

    return NextResponse.json(
      {
        reply: {
          ...reply,
          authorName: session.name,
          createdAt: reply.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Forum reply error");
    return NextResponse.json({ error: "Failed to create reply" }, { status: 500 });
  }
}
