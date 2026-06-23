// GET   /api/dm/threads/[id] — fetch a thread + messages (read-only)
// PATCH /api/dm/threads/[id] — mark caller's last_seen as "now" so unread
//                              clears (CSRF-protected; was a side effect on GET)
// POST  /api/dm/threads/[id] — append a message to the thread

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { dmThreads, dmMessages, users } from "@/lib/db/schema";
import { eq, and, or, asc } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("dm-thread");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const messageSchema = z.object({
  body: z.string().min(1).max(8000).trim(),
});

async function loadThread(threadId: string, userId: string) {
  const [t] = await db
    .select()
    .from(dmThreads)
    .where(
      and(
        eq(dmThreads.id, threadId),
        or(eq(dmThreads.userAId, userId), eq(dmThreads.userBId, userId))
      )
    )
    .limit(1);
  return t ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const thread = await loadThread(id, session.userId);
    if (!thread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const otherId =
      thread.userAId === session.userId ? thread.userBId : thread.userAId;

    const result = await withTimeout(3000, async (tx) => {
      const [other] = await tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, otherId))
        .limit(1);

      const msgs = await tx
        .select({
          id: dmMessages.id,
          authorId: dmMessages.authorId,
          body: dmMessages.body,
          createdAt: dmMessages.createdAt,
        })
        .from(dmMessages)
        .where(eq(dmMessages.threadId, id))
        .orderBy(asc(dmMessages.createdAt))
        .limit(500);

      return { other, messages: msgs };
    });

    // Mark-seen is NOT done here (audit #47): a GET must not mutate state. The
    // client clears its unread badge via the CSRF-protected PATCH below.
    return NextResponse.json(
      { thread, other: result.other, messages: result.messages },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "DM thread GET error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// Mark the caller's side of the thread as seen (clears the unread badge).
// CSRF-protected because it mutates state — previously this was a side effect
// on the GET handler, which a cross-site top-level navigation could trigger
// (audit #47). loadThread scopes ownership, so a non-participant 404s.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const thread = await loadThread(id, auth.userId);
    if (!thread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isA = thread.userAId === auth.userId;
    await db
      .update(dmThreads)
      .set(isA ? { aLastSeenAt: new Date() } : { bLastSeenAt: new Date() })
      .where(eq(dmThreads.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "DM thread PATCH error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const thread = await loadThread(id, auth.userId);
    if (!thread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date();
    const isA = thread.userAId === auth.userId;
    await db.transaction(async (tx) => {
      await tx.insert(dmMessages).values({
        threadId: id,
        authorId: auth.userId,
        body: parsed.data.body,
      });
      await tx
        .update(dmThreads)
        .set({
          lastMessageAt: now,
          // Author of the new message has "seen" everything in the
          // thread; clear their unread state implicitly.
          ...(isA ? { aLastSeenAt: now } : { bLastSeenAt: now }),
        })
        .where(eq(dmThreads.id, id));
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "DM thread POST error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
