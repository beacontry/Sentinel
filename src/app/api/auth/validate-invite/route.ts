import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ valid: false, error: "No token provided" });
  }

  const [invite] = await db
    .select({ email: invites.email, used: invites.used, expiresAt: invites.expiresAt })
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
    return NextResponse.json({ valid: false, error: "Invalid or expired invite link." });
  }

  return NextResponse.json({ valid: true, email: invite.email });
}
