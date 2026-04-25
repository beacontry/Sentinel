import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { userRiskProfiles } from "@/lib/db/schema";
import { updateRiskProfileSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [existing] = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(userRiskProfiles)
        .where(eq(userRiskProfiles.userId, session.userId))
        .limit(1);
    });

    // Return the profile if it exists, or null (all-engine-defaults)
    return NextResponse.json({ profile: existing ?? null });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    return NextResponse.json({ error: "Failed to load risk profile" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateRiskProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Ensure profile exists
  const [existing] = await db
    .select()
    .from(userRiskProfiles)
    .where(eq(userRiskProfiles.userId, auth.userId))
    .limit(1);

  if (!existing) {
    // Create with the provided values (nulls are fine — means "engine decides")
    const [created] = await db
      .insert(userRiskProfiles)
      .values({ userId: auth.userId, ...parsed.data })
      .returning();
    return NextResponse.json({ profile: created });
  }

  const [updated] = await db
    .update(userRiskProfiles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(userRiskProfiles.userId, auth.userId))
    .returning();

  return NextResponse.json({ profile: updated });
}
