// GET   /api/support/tickets/[id]      — fetch ticket + full message thread
// POST  /api/support/tickets/[id]      — append a message (user OR admin)
// PATCH /api/support/tickets/[id]      — change status / priority (admin only,
//                                        or user closing their own ticket)

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { supportTickets, supportMessages, users } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { sendAlertEmail } from "@/lib/email";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("support-detail");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const messageSchema = z.object({
  body: z.string().min(1, "Empty message").max(8000).trim(),
});

const patchSchema = z.object({
  status: z.enum(["open", "responded", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
});

async function loadTicket(ticketId: string, userId: string, isAdmin: boolean) {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.id, ticketId),
        // Admins can see any ticket; users only their own
        isAdmin ? eq(supportTickets.id, ticketId) : eq(supportTickets.userId, userId)
      )
    )
    .limit(1);
  return ticket ?? null;
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
    const result = await withTimeout(3000, async (tx) => {
      const isAdmin = session.role === "admin";
      const [ticket] = await tx
        .select({
          id: supportTickets.id,
          userId: supportTickets.userId,
          subject: supportTickets.subject,
          status: supportTickets.status,
          priority: supportTickets.priority,
          createdAt: supportTickets.createdAt,
          updatedAt: supportTickets.updatedAt,
          authorEmail: users.email,
          authorName: users.name,
        })
        .from(supportTickets)
        .innerJoin(users, eq(users.id, supportTickets.userId))
        .where(
          and(
            eq(supportTickets.id, id),
            isAdmin ? eq(supportTickets.id, id) : eq(supportTickets.userId, session.userId)
          )
        )
        .limit(1);
      if (!ticket) return null;

      const messages = await tx
        .select({
          id: supportMessages.id,
          authorId: supportMessages.authorId,
          authorRole: supportMessages.authorRole,
          body: supportMessages.body,
          createdAt: supportMessages.createdAt,
        })
        .from(supportMessages)
        .where(eq(supportMessages.ticketId, id))
        .orderBy(asc(supportMessages.createdAt));

      return { ticket, messages };
    });

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Support detail error");
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

  const isAdmin = auth.role === "admin";

  try {
    // Verify the user can post on this ticket
    const ticket = await loadTicket(id, auth.userId, isAdmin);
    if (!ticket) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (ticket.status === "closed") {
      return NextResponse.json({ error: "Ticket is closed" }, { status: 409 });
    }

    const authorRole: "user" | "admin" = isAdmin ? "admin" : "user";
    await db.transaction(async (tx) => {
      await tx.insert(supportMessages).values({
        ticketId: id,
        authorId: auth.userId,
        authorRole,
        body: parsed.data.body,
      });
      // Status flow: admin reply → "responded", user reply on a responded
      // ticket → "open" again (something new from the user)
      const nextStatus = authorRole === "admin" ? "responded" : "open";
      await tx
        .update(supportTickets)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(supportTickets.id, id));
    });

    // Email notification — admin reply notifies the user, user reply
    // notifies the admins. Best-effort.
    try {
      if (authorRole === "admin") {
        const [recipient] = await db
          .select({ email: users.email, notificationEmail: users.notificationEmail })
          .from(users)
          .where(eq(users.id, ticket.userId))
          .limit(1);
        if (recipient) {
          const addr = recipient.notificationEmail ?? recipient.email;
          await sendAlertEmail(
            addr,
            `Support reply: ${ticket.subject}`,
            `An admin replied to your support ticket:\n\n${parsed.data.body}\n\nView at /dashboard/support/${id}`
          ).catch(() => {});
        }
      } else {
        const admins = await db
          .select({ email: users.email, notificationEmail: users.notificationEmail })
          .from(users)
          .where(eq(users.role, "admin"));
        for (const admin of admins) {
          const addr = admin.notificationEmail ?? admin.email;
          await sendAlertEmail(
            addr,
            `Support: user replied — ${ticket.subject}`,
            `${auth.email ?? "User"} replied:\n\n${parsed.data.body}\n\nReply at /dashboard/support/${id}`
          ).catch(() => {});
        }
      }
    } catch {
      /* notification failure non-blocking */
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Support reply error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const isAdmin = auth.role === "admin";
  const ticket = await loadTicket(id, auth.userId, isAdmin);
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Users can only close their own ticket; admins can do anything.
  if (!isAdmin) {
    if (parsed.data.priority !== undefined) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (parsed.data.status && parsed.data.status !== "closed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await db
      .update(supportTickets)
      .set({
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Support patch error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
