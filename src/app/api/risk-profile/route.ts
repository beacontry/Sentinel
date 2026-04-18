import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { userRiskProfiles } from "@/lib/db/schema";
import { updateRiskProfileSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Auto-create default profile if none exists
  const [existing] = await db
    .select()
    .from(userRiskProfiles)
    .where(eq(userRiskProfiles.userId, session.userId))
    .limit(1);

  if (existing) {
    return NextResponse.json({ profile: existing });
  }

  const [created] = await db
    .insert(userRiskProfiles)
    .values({ userId: session.userId })
    .returning();

  return NextResponse.json({ profile: created });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateRiskProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Ensure profile exists
  const [existing] = await db
    .select()
    .from(userRiskProfiles)
    .where(eq(userRiskProfiles.userId, session.userId))
    .limit(1);

  if (!existing) {
    // Create with the provided values
    const [created] = await db
      .insert(userRiskProfiles)
      .values({ userId: session.userId, ...parsed.data })
      .returning();
    return NextResponse.json({ profile: created });
  }

  const [updated] = await db
    .update(userRiskProfiles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(userRiskProfiles.userId, session.userId))
    .returning();

  return NextResponse.json({ profile: updated });
}
