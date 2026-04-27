import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limiter";
import { createRouteLogger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import { z } from "zod";

const log = createRouteLogger("auth/pin-login");

const schema = z.object({
  email: z.string().email(),
  pin: z.string().regex(/^\d{4,6}$/),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  // Strict rate limiting on PIN — 5 attempts per 5 minutes
  const { allowed } = rateLimit(`pin:${ip}`, 5, 300);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please sign in with your password." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, pin } = parsed.data;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      pinHash: users.pinHash,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
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
