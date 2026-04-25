import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { socialFollows, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("social-follow");

const followSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const following = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          id: socialFollows.id,
          followingId: socialFollows.followingId,
          createdAt: socialFollows.createdAt,
          userName: users.name,
        })
        .from(socialFollows)
        .innerJoin(users, eq(socialFollows.followingId, users.id))
        .where(eq(socialFollows.followerId, session.userId));
    });

    return NextResponse.json({
      following: following.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Follow list error");
    return NextResponse.json({ error: "Failed to load follows" }, { status: 500 });
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

  const parsed = followSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const targetUserId = parsed.data.userId;

  if (targetUserId === auth.userId) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  try {
    // Verify target user exists
    const target = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (target.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if already following
    const existing = await db
      .select({ id: socialFollows.id })
      .from(socialFollows)
      .where(
        and(
          eq(socialFollows.followerId, auth.userId),
          eq(socialFollows.followingId, targetUserId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Unfollow
      await db
        .delete(socialFollows)
        .where(eq(socialFollows.id, existing[0].id));

      return NextResponse.json({ following: false });
    } else {
      // Follow
      await db
        .insert(socialFollows)
        .values({
          followerId: auth.userId,
          followingId: targetUserId,
        });

      return NextResponse.json({ following: true }, { status: 201 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Follow toggle error");
    return NextResponse.json({ error: "Failed to toggle follow" }, { status: 500 });
  }
}
