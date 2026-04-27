import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
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
