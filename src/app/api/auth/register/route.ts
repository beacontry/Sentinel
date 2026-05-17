// POST /api/auth/register
//
// Two registration paths, both routed through this one endpoint:
//
//   1. Anonymous public signup (no `token` field) — creates a `free`-tier
//      account. This is the path the landing-page / pricing-page CTAs
//      drive to. Defenses against abuse:
//        - IP rate-limit (5 / 60s)
//        - Honeypot field `website` (bots fill hidden fields; real
//          users don't). On hit we return 201 OK silently to avoid
//          revealing the trap, but never insert the user.
//        - Email format + uniqueness (case-insensitive)
//        - No invite token can ever upgrade tier on this path
//
//   2. Invite-token signup — admin issues an invite at /dashboard/admin
//      → recipient gets an email with /register?token=... → that path
//      pre-validates the token and posts it back here. Used to seed
//      tiered accounts (manual Trader / Premium grants pre-Stripe) and
//      for closed-beta cohorts where admin wants to control who lands.
//
// Tier is ALWAYS set to `free` here regardless of path. Admin grants
// upgraded tiers post-signup via /api/admin/users/[id]/tier (Phase 1
// of the billing rollout — Stripe is Phase 2).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, invites } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validators";
import { hashPassword, createToken, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limiter";
import { getRateLimitIp } from "@/lib/rate-limit-ip";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";
import { getAppSettingBool } from "@/lib/app-settings";
import { sendAlertEmail } from "@/lib/email";
import { eq, and, gt } from "drizzle-orm";

const logger = createRouteLogger("auth/register");

/**
 * Best-effort admin notification on a new account. Fires for both public
 * and invite-token paths. Gate via NOTIFY_ADMINS_ON_REGISTER app setting
 * so an admin can mute it during a Show HN spike. Never blocks the
 * signup response if email fails — caller awaits with .catch.
 */
async function notifyAdminsOfNewUser(
  newUser: { email: string; name: string },
  path: "public" | "invite"
): Promise<void> {
  try {
    const notifyEnabled = await getAppSettingBool("NOTIFY_ADMINS_ON_REGISTER");
    if (!notifyEnabled) return;

    const admins = await db
      .select({ email: users.email, notificationEmail: users.notificationEmail })
      .from(users)
      .where(eq(users.role, "admin"));

    for (const admin of admins) {
      const addr = admin.notificationEmail ?? admin.email;
      await sendAlertEmail(
        addr,
        `New Beacontry signup: ${newUser.email}`,
        `A new user just registered via ${path === "invite" ? "an invite" : "public signup"}.\n\n` +
          `  Email: ${newUser.email}\n` +
          `  Name:  ${newUser.name}\n\n` +
          `Review at /dashboard/admin (Audit Log tab for full details).\n\n` +
          `Mute these notifications at /dashboard/admin/system-config → App Settings → NOTIFY_ADMINS_ON_REGISTER.`
      ).catch(() => {});
    }
  } catch {
    // Never block signup on a notification failure
  }
}

export async function POST(request: Request) {
  try {
    const ip = getRateLimitIp(request);
    const { allowed } = rateLimit(`register:${ip}`, 5, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();

    // Honeypot — bots fill hidden form fields, real users never see them.
    // If `website` is present and non-empty, drop silently with 201 so the
    // attacker can't probe whether the trap exists. No DB write, no audit.
    if (typeof body.website === "string" && body.website.trim().length > 0) {
      logger.warn({ ip, email: body.email }, "Honeypot hit on register");
      // Return a believable-success response — bots move on, real users
      // wouldn't reach this branch.
      return NextResponse.json({ user: null }, { status: 201 });
    }

    const token = typeof body.token === "string" ? body.token : null;

    // ---- Path 1: invite-token registration --------------------------------
    if (token) {
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

      // Email must match the invite (prevents stealing someone else's invite)
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

      await db
        .update(invites)
        .set({ used: true, usedAt: new Date() })
        .where(eq(invites.id, invite.id));

      await writeAudit({
        actor: { userId: user.id, email: user.email, role: user.role },
        action: AuditAction.AUTH_REGISTERED,
        resourceType: "user",
        resourceId: user.id,
        metadata: { email: user.email, inviteId: invite.id, path: "invite" },
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

      // Best-effort notify admins (gated by NOTIFY_ADMINS_ON_REGISTER).
      // Awaited but ignores errors so signup never fails on email problems.
      await notifyAdminsOfNewUser(user, "invite");

      return await issueSession(user, request);
    }

    // ---- Path 2: anonymous public free-tier signup ------------------------
    // Gate: public signup can be temporarily paused by an admin without
    // a redeploy. Invite-token path above stays open so admins can still
    // hand out access in case of an incident.
    const registrationOpen = await getAppSettingBool("REGISTRATION_OPEN");
    if (!registrationOpen) {
      logger.warn({ ip }, "Public registration is currently disabled");
      return NextResponse.json(
        {
          error:
            "Public signups are temporarily paused. Email hello@beacontry.com for an invite.",
        },
        { status: 503 }
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

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      // Don't tell the attacker whether the email exists — generic message.
      // Real users wanting to sign in see the same UI prompt to use /login.
      return NextResponse.json(
        { error: "An account with this email already exists. Sign in instead?" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    // Tier hardcoded to default ('free') — never trust a client-sent tier
    // value. Admin grants paid tiers post-signup via the admin UI.
    const [user] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash,
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    await writeAudit({
      actor: { userId: user.id, email: user.email, role: user.role },
      action: AuditAction.AUTH_REGISTERED,
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email, path: "public" },
      request,
    });

    logger.info({ email, ip }, "User registered via public signup");

    // Best-effort notify admins (gated by NOTIFY_ADMINS_ON_REGISTER).
    await notifyAdminsOfNewUser(user, "public");

    return await issueSession(user, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message }, "Registration failed");
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}

/**
 * Mint a session cookie + return the success response. Shared between the
 * invite and public paths so the post-registration UX is identical.
 */
async function issueSession(
  user: { id: string; name: string; email: string; role: string },
  _request: Request
): Promise<NextResponse> {
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

  return response;
}
