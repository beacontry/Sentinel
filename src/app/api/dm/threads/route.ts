// GET  /api/dm/threads — list threads the caller participates in
// POST /api/dm/threads — start (or get) a thread with another user
//
// Threads always store the user pair sorted (lower uuid first) so the
// unique constraint catches duplicates regardless of who initiated.

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { dmThreads, dmMessages, users } from "@/lib/db/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("dm-threads");

const startSchema = z.object({
  recipientId: z.string().uuid(),
  body: z.string().min(1).max(8000).trim(),
});

// Sort two uuids into (lower, higher). Required by the schema constraint
// `user_a_id < user_b_id`. PG compares uuids lexicographically.
function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await withTimeout(3000, async (tx) => {
      // Find every thread where this user is either A or B. Also pull
      // the *other* user's name + the last message + unread count.
      const me = session.userId;
      return tx
        .select({
          id: dmThreads.id,
          lastMessageAt: dmThreads.lastMessageAt,
          createdAt: dmThreads.createdAt,
          aLastSeenAt: dmThreads.aLastSeenAt,
          bLastSeenAt: dmThreads.bLastSeenAt,
          userAId: dmThreads.userAId,
          userBId: dmThreads.userBId,
          otherUserName: sql<string>`(
            SELECT u.name FROM users u
            WHERE u.id = CASE WHEN dm_threads.user_a_id = ${me} THEN dm_threads.user_b_id ELSE dm_threads.user_a_id END
          )`,
          otherUserEmail: sql<string>`(
            SELECT u.email FROM users u
            WHERE u.id = CASE WHEN dm_threads.user_a_id = ${me} THEN dm_threads.user_b_id ELSE dm_threads.user_a_id END
          )`,
          // Last message preview
          lastMessageBody: sql<string | null>`(
            SELECT body FROM dm_messages
            WHERE dm_messages.thread_id = dm_threads.id
            ORDER BY dm_messages.created_at DESC LIMIT 1
          )`,
          // Unread count — messages newer than my last-seen timestamp
          // AND not authored by me
          unreadCount: sql<number>`(
            SELECT COUNT(*)::int FROM dm_messages
            WHERE dm_messages.thread_id = dm_threads.id
              AND dm_messages.author_id <> ${me}
              AND dm_messages.created_at > COALESCE(
                CASE WHEN dm_threads.user_a_id = ${me}
                  THEN dm_threads.a_last_seen_at
                  ELSE dm_threads.b_last_seen_at
                END,
                '1970-01-01'::timestamptz
              )
          )`,
        })
        .from(dmThreads)
        .where(or(eq(dmThreads.userAId, me), eq(dmThreads.userBId, me)))
        .orderBy(desc(dmThreads.lastMessageAt))
        .limit(100);
    });

    return NextResponse.json(
      { threads: rows },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "DM threads list error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  if (parsed.data.recipientId === auth.userId) {
    return NextResponse.json({ error: "Cannot DM yourself" }, { status: 400 });
  }

  try {
    const [a, b] = sortPair(auth.userId, parsed.data.recipientId);

    // Verify the recipient exists. Without this, a typo'd uuid would
    // fail the FK constraint with a 500.
    const [recipient] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, parsed.data.recipientId))
      .limit(1);
    if (!recipient) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    const result = await db.transaction(async (tx) => {
      // Upsert the thread — get or create
      const [existing] = await tx
        .select()
        .from(dmThreads)
        .where(and(eq(dmThreads.userAId, a), eq(dmThreads.userBId, b)))
        .limit(1);

      let threadId: string;
      if (existing) {
        threadId = existing.id;
        await tx
          .update(dmThreads)
          .set({ lastMessageAt: new Date() })
          .where(eq(dmThreads.id, threadId));
      } else {
        const [created] = await tx
          .insert(dmThreads)
          .values({ userAId: a, userBId: b, lastMessageAt: new Date() })
          .returning({ id: dmThreads.id });
        threadId = created.id;
      }

      await tx.insert(dmMessages).values({
        threadId,
        authorId: auth.userId,
        body: parsed.data.body,
      });

      return threadId;
    });

    return NextResponse.json({ success: true, threadId: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "DM start error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
