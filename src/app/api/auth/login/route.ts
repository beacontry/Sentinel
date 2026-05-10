import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { loginSchema } from "@/lib/validators";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limiter";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";
import { eq } from "drizzle-orm";

const logger = createRouteLogger("auth/login");

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const { allowed } = rateLimit(`login:${ip}`, 5, 10);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      await writeAudit({
        actor: { userId: null, email },
        action: AuditAction.AUTH_LOGIN_FAILED,
        metadata: { email, reason: "user_not_found" },
        request,
      });
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await writeAudit({
        actor: { userId: user.id, email: user.email, role: user.role },
        action: AuditAction.AUTH_LOGIN_FAILED,
        metadata: { email: user.email, reason: "wrong_password" },
        request,
      });
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "admin" | "user",
    });

    await writeAudit({
      actor: { userId: user.id, email: user.email, role: user.role },
      action: AuditAction.AUTH_LOGIN_SUCCESS,
      metadata: { email: user.email },
      request,
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

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: message }, "Login failed");
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}
