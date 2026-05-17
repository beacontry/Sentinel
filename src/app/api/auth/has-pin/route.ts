import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limiter";
import { getRateLimitIp } from "@/lib/rate-limit-ip";

// Rate-limited to make this useless as a user-enumeration oracle. The
// response shape is also uniform regardless of whether the email exists
// (unknown email → hasPin: false, same as a real user without a PIN).
export async function GET(request: NextRequest) {
  const ip = getRateLimitIp(request);
  const { allowed } = rateLimit(`has-pin:${ip}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ hasPin: false }, { status: 429 });
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ hasPin: false });
  }

  const [user] = await db
    .select({ pinHash: users.pinHash })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  return NextResponse.json({ hasPin: !!user?.pinHash });
}
