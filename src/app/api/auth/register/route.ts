import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, invites } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validators";
import { hashPassword, createToken, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limiter";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";
import { eq, and, gt } from "drizzle-orm";

const logger = createRouteLogger("auth/register");

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const { allowed } = rateLimit(`register:${ip}`, 5, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Require invite token
    const token = body.token;
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Registration is invite-only. Please use a valid invite link." },
        { status: 403 }
      );
    }

    // Validate invite token
    const [invite] = await db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.token, token),
          eq(invites.used, false),
          gt(invites.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!invite) {
      return NextResponse.json(
        { error: "Invalid or expired invite. Please request a new invitation." },
        { status: 403 }
      );
    }

    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString();
        if (field) fieldErrors[field] = issue.message;
      }
      return NextResponse.json(
        { error: "Validation failed", fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;

    // Email must match the invite
    if (email.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match the invitation. Please use the email the invite was sent to." },
        { status: 403 }
      );
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash,
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    // Mark invite as used
    await db
      .update(invites)
      .set({ used: true, usedAt: new Date() })
      .where(eq(invites.id, invite.id));

    await writeAudit({
      actor: { userId: user.id, email: user.email, role: user.role },
      action: AuditAction.AUTH_REGISTERED,
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email, inviteId: invite.id },
      request,
    });
    await writeAudit({
      actor: { userId: user.id, email: user.email, role: user.role },
      action: AuditAction.INVITE_CONSUMED,
      resourceType: "invite",
      resourceId: invite.id,
      metadata: { email: user.email },
      request,
    });

    const jwtToken = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "admin" | "user",
    });

    const cookie = setSessionCookie(jwtToken);
    const response = NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { status: 201 }
    );

    response.cookies.set(
      cookie.name,
      cookie.value,
      cookie.options as Parameters<typeof response.cookies.set>[2]
    );

    logger.info({ email, inviteId: invite.id }, "User registered via invite");

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message }, "Registration failed");
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
