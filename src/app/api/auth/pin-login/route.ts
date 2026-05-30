import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limiter";
import { getRateLimitIp } from "@/lib/rate-limit-ip";
import { createRouteLogger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { z } from "zod";

const log = createRouteLogger("auth/pin-login");

const schema = z.object({
  email: z.string().email(),
  pin: z.string().regex(/^\d{4,6}$/),
});

export async function POST(request: Request) {
  const ip = getRateLimitIp(request);

  // Strict rate limiting on PIN — 5 attempts per 5 minutes
  const { allowed } = rateLimit(`pin:${ip}`, 5, 300);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please sign in with your password." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, pin } = parsed.data;
  const emailKey = email.toLowerCase();

  // Per-account lockout (IP-independent). The per-IP limit above doesn't stop
  // a distributed / IP-rotating attack from brute-forcing a 4-digit PIN, since
  // each IP gets a fresh budget against the same account. 5 attempts / 15 min
  // per account; the user can still fall back to password (message says so).
  const acct = rateLimit(`pin:acct:${emailKey}`, 5, 900);
  if (!acct.allowed) {
    log.warn({ email }, "PIN login locked — too many per-account attempts");
    return NextResponse.json(
      { error: "Too many attempts. Please sign in with your password." },
      { status: 429 }
    );
  }

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      pinHash: users.pinHash,
    })
    .from(users)
    .where(eq(users.email, emailKey))
    .limit(1);

  if (!user || !user.pinHash) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const valid = await verifyPassword(pin, user.pinHash);
  if (!valid) {
    log.warn({ email }, "Failed PIN login attempt");
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const token = await createToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "admin" | "user",
  });

  const cookie = setSessionCookie(token);
  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });

  response.cookies.set(
    cookie.name,
    cookie.value,
    cookie.options as Parameters<typeof response.cookies.set>[2]
  );

  log.info({ email }, "PIN login successful");
  return response;
}
