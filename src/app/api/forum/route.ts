import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  forumThreads,
  forumCategories,
  users,
} from "@/lib/db/schema";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { createForumThreadSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions = [];
    if (categoryId) {
      conditions.push(eq(forumThreads.categoryId, categoryId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(forumThreads)
      .where(whereClause);

    // Get threads with author + category + reply count + last reply time
    const threads = await db
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
        replyCount: sql<number>`(
          SELECT count(*)::int FROM forum_replies
          WHERE forum_replies.thread_id = ${forumThreads.id}
        )`,
        lastReplyAt: sql<string | null>`(
          SELECT max(forum_replies.created_at)::text FROM forum_replies
          WHERE forum_replies.thread_id = ${forumThreads.id}
        )`,
      })
      .from(forumThreads)
      .innerJoin(users, eq(forumThreads.userId, users.id))
      .innerJoin(forumCategories, eq(forumThreads.categoryId, forumCategories.id))
      .where(whereClause)
      .orderBy(desc(forumThreads.pinned), desc(forumThreads.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      threads: threads.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Forum list error:", message);
    return NextResponse.json({ error: "Failed to load threads" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createForumThreadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Verify category exists
    const category = await db
      .select({ id: forumCategories.id })
      .from(forumCategories)
      .where(eq(forumCategories.id, parsed.data.categoryId))
      .limit(1);

    if (category.length === 0) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const [thread] = await db
      .insert(forumThreads)
      .values({
        userId: session.userId,
        categoryId: parsed.data.categoryId,
        title: parsed.data.title,
        body: parsed.data.body,
      })
      .returning();

    return NextResponse.json(
      {
        thread: {
          ...thread,
          authorName: session.name,
          createdAt: thread.createdAt.toISOString(),
          updatedAt: thread.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Forum create error:", message);
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  }
}
