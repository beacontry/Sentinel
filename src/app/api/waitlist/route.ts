// POST /api/waitlist
//
// Public, unauthenticated email-capture from the Beacontry landing page.
// Stores rows in the `waitlist` table for admins to convert into actual
// invites later via /dashboard/admin → Invitations.
//
// Defensive design — this endpoint is internet-facing without auth:
//   - Rate-limited per IP (5 / 60s) to slow brute submission
//   - Zod-validated email format
//   - Case-insensitive ON CONFLICT to dedupe duplicate signups (re-submit
//     just bumps `created_at`, doesn't error)
//   - Honeypot field "website" — bots fill hidden form fields; if it has
//     a value we accept the POST silently (200 OK) but don't write the row.
//     Real users never see the field.
//   - User-Agent + IP captured for later abuse triage
//   - No PII other than the email itself

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limiter";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("waitlist");

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  source: z.string().max(64).optional(),
  // Honeypot — real users leave this empty. Bots fill it because they
  // see "website" and assume it's required.
  website: z.string().max(1000).optional(),
});

function clientIp(request: NextRequest): string {
  // Behind Cloudflare → trust CF-Connecting-IP. Behind Caddy → trust
  // X-Forwarded-For. Local dev → fallback to "unknown".
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  // 5 signups per IP per minute is generous for legitimate users
  // (someone submitting twice because they thought it didn't work) and
  // restrictive enough to discourage scripted spam.
  const rl = rateLimit(`waitlist:${ip}`, 5, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Honeypot — bot caught. Return success so the bot doesn't probe for
  // the trap. Don't write anything to the DB.
  if (parsed.data.website && parsed.data.website.length > 0) {
    log.warn({ ip, ua: request.headers.get("user-agent") }, "Honeypot tripped");
    return NextResponse.json({ success: true });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const source = parsed.data.source?.trim() || null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  try {
    // ON CONFLICT — case-insensitive uniqueness is enforced by the
    // LOWER(email) functional index in the migration. Drizzle's
    // onConflictDoNothing path can't target functional indexes by name
    // directly, so we fall back to raw SQL with the right ON CONFLICT
    // clause. Re-signing-up just bumps `created_at` rather than erroring.
    await db.execute(sql`
      INSERT INTO waitlist (email, source, user_agent, ip)
      VALUES (${email}, ${source}, ${userAgent}, ${ip})
      ON CONFLICT (LOWER(email)) DO UPDATE
        SET created_at = NOW()
    `);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    log.error({ err: message, email }, "Waitlist insert failed");
    return NextResponse.json(
      { error: "Couldn't save right now. Try again in a moment." },
      { status: 500 }
    );
  }
}
