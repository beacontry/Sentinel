import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { feedPosts, feedLikes, signals, users } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("feed");

const createPostSchema = z.object({
  symbol: z.string().min(1).max(10),
  signal: z.string(),
  confidence: z.number(),
  price: z.number(),
  plainEnglish: z.string(),
  comment: z.string().max(500).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posts = await db
    .select({
      id: feedPosts.id,
      userId: feedPosts.userId,
      userName: users.name,
      comment: feedPosts.comment,
      createdAt: feedPosts.createdAt,
      symbol: signals.symbol,
      signal: signals.signal,
      confidence: signals.confidence,
      price: signals.price,
      plainEnglish: signals.plainEnglish,
      likes: sql<number>`(SELECT count(*) FROM feed_likes WHERE post_id = ${feedPosts.id})`.as("likes"),
      liked: sql<boolean>`EXISTS(SELECT 1 FROM feed_likes WHERE post_id = ${feedPosts.id} AND user_id = ${session.userId})`.as("liked"),
    })
    .from(feedPosts)
    .innerJoin(users, eq(feedPosts.userId, users.id))
    .innerJoin(signals, eq(feedPosts.signalId, signals.id))
    .orderBy(desc(feedPosts.createdAt))
    .limit(50);

  return NextResponse.json({
    posts: posts.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    // Create a signal record for this post
    const [signal] = await db
      .insert(signals)
      .values({
        symbol: parsed.data.symbol.toUpperCase(),
        signal: parsed.data.signal,
        confidence: parsed.data.confidence,
        price: parsed.data.price,
        volume: 0,
        indicators: {},
        plainEnglish: parsed.data.plainEnglish,
      })
      .returning({ id: signals.id });

    await db.insert(feedPosts).values({
      userId: session.userId,
      signalId: signal.id,
      comment: parsed.data.comment ?? null,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Feed post error");
    return NextResponse.json({ error: "Failed to post" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const postId = body.postId;

  if (!postId || typeof postId !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Toggle like
  const existing = await db
    .select({ id: feedLikes.id })
    .from(feedLikes)
    .where(
      and(
        eq(feedLikes.postId, postId),
        eq(feedLikes.userId, session.userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(feedLikes)
      .where(
        and(
          eq(feedLikes.postId, postId),
          eq(feedLikes.userId, session.userId)
        )
      );
  } else {
    await db.insert(feedLikes).values({
      postId,
      userId: session.userId,
    });
  }

  return NextResponse.json({ success: true });
}
