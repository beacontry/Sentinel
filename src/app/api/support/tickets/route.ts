// GET  /api/support/tickets — list caller's tickets (or all if admin)
// POST /api/support/tickets — open a new ticket with the initial message

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { supportTickets, supportMessages, users } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { sendAlertEmail } from "@/lib/email";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("support");

const createTicketSchema = z.object({
  subject: z.string().min(3, "Subject too short").max(200).trim(),
  body: z.string().min(10, "Please describe the issue (min 10 chars)").max(8000).trim(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.role === "admin";

  try {
    const rows = await withTimeout(3000, async (tx) => {
      // Admins see all tickets; users see only their own.
      const baseQuery = tx
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
          messageCount: sql<number>`(
            SELECT COUNT(*)::int FROM support_messages WHERE support_messages.ticket_id = support_tickets.id
          )`,
        })
        .from(supportTickets)
        .innerJoin(users, eq(users.id, supportTickets.userId))
        .orderBy(desc(supportTickets.updatedAt))
        .limit(100);

      return isAdmin
        ? baseQuery
        : baseQuery.where(eq(supportTickets.userId, session.userId));
    });

    return NextResponse.json(
      { tickets: rows, isAdmin },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Support list error");
    return NextResponse.json({ error: "Failed to list tickets" }, { status: 500 });
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

  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [ticket] = await tx
        .insert(supportTickets)
        .values({
          userId: auth.userId,
          subject: parsed.data.subject,
          priority: parsed.data.priority,
          status: "open",
        })
        .returning();
      await tx.insert(supportMessages).values({
        ticketId: ticket.id,
        authorId: auth.userId,
        authorRole: auth.role === "admin" ? "admin" : "user",
        body: parsed.data.body,
      });
      return ticket;
    });

    // Notify admins via email — best-effort, doesn't block ticket creation
    try {
      const admins = await db
        .select({ email: users.email, notificationEmail: users.notificationEmail })
        .from(users)
        .where(eq(users.role, "admin"));
      for (const admin of admins) {
        const recipient = admin.notificationEmail ?? admin.email;
        await sendAlertEmail(
          recipient,
          `New support ticket: ${parsed.data.subject}`,
          `${auth.email ?? "A user"} opened a support ticket.\n\n` +
            `Subject: ${parsed.data.subject}\n` +
            `Priority: ${parsed.data.priority}\n\n` +
            `${parsed.data.body}\n\n` +
            `Reply at /dashboard/support`
        ).catch(() => {});
      }
    } catch {
      // Don't break ticket creation on notification failure
    }

    return NextResponse.json({ success: true, ticket: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Support create error");
    return NextResponse.json({ error: "Failed to open ticket" }, { status: 500 });
  }
}
