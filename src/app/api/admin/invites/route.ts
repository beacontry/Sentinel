import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { invites, users } from "@/lib/db/schema";
import { requireAuthForRead, requireAuthWithCsrf } from "@/lib/auth";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const log = createRouteLogger("admin/invites");

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// ─── GET: List all invites ──────────────────────────────────────

export async function GET() {
  const session = await requireAuthForRead(["admin"]);
  if (session instanceof Response) return session;

  try {
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          id: invites.id,
          email: invites.email,
          token: invites.token,
          used: invites.used,
          expiresAt: invites.expiresAt,
          createdAt: invites.createdAt,
          usedAt: invites.usedAt,
        })
        .from(invites)
        .orderBy(desc(invites.createdAt))
        .limit(100);
    });

    return NextResponse.json({ invites: rows });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json({ error: "Query timed out" }, { status: 504, headers: { "X-Query-Timeout": "true" } });
    }
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to list invites");
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

// ─── POST: Create and send invite ───────────────────────────────

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email", details: parsed.error.flatten() }, { status: 400 });
  }

  const { email } = parsed.data;

  // Check if user already exists
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  // Generate token (48 bytes = 96 hex chars)
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  try {
    const [invite] = await db
      .insert(invites)
      .values({
        email: email.toLowerCase(),
        token,
        invitedBy: auth.userId,
        expiresAt,
      })
      .returning({ id: invites.id, email: invites.email, expiresAt: invites.expiresAt });

    // Send invite email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const signupUrl = `${appUrl}/register?token=${token}`;

    const { sendInviteEmail } = await import("@/lib/email");
    const emailResult = await sendInviteEmail(email, signupUrl);

    log.info({ email, inviteId: invite.id, emailSent: emailResult.success }, "Invite created");

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.INVITE_SENT,
      resourceType: "invite",
      resourceId: invite.id,
      metadata: { email, emailSent: emailResult.success, expiresAt: invite.expiresAt.toISOString() },
      request,
    });

    return NextResponse.json({
      invite,
      signupUrl,
      emailSent: emailResult.success,
    }, { status: 201 });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to create invite");
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
