import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { userRiskProfiles } from "@/lib/db/schema";
import { updateRiskProfileSchema } from "@/lib/validators";
import { writeAudit, AuditAction } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { checkTier } from "@/lib/tiers-server";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("risk-profile");

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
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

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

  // Create or update in one transaction, without a select-then-insert race.
  // The insert is ON CONFLICT (user_id) DO NOTHING: if it returns the row,
  // this request created the profile. Otherwise the row exists (possibly
  // committed a moment ago by a concurrent first save, which used to surface
  // as an unhandled unique-violation 500), and it is read FOR UPDATE so the
  // audit diff is taken against the values this update actually replaces.
  type Profile = typeof userRiskProfiles.$inferSelect;
  let outcome:
    | { created: true; profile: Profile }
    | { created: false; profile: Profile; changes: Record<string, { from: unknown; to: unknown }> };
  try {
    outcome = await db.transaction(async (tx) => {
      // Nulls are fine on create: they mean "engine decides".
      const [created] = await tx
        .insert(userRiskProfiles)
        .values({ userId: auth.userId, ...parsed.data })
        .onConflictDoNothing({ target: userRiskProfiles.userId })
        .returning();
      if (created) return { created: true as const, profile: created };

      const [existing] = await tx
        .select()
        .from(userRiskProfiles)
        .where(eq(userRiskProfiles.userId, auth.userId))
        .for("update");

      // Diff: only record fields that actually changed
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, value] of Object.entries(parsed.data)) {
        const prev = (existing as unknown as Record<string, unknown> | undefined)?.[key];
        if (prev !== value) changes[key] = { from: prev ?? null, to: value ?? null };
      }

      const [updated] = await tx
        .update(userRiskProfiles)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(userRiskProfiles.userId, auth.userId))
        .returning();
      return { created: false as const, profile: updated, changes };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, userId: auth.userId }, "Risk profile save failed");
    return NextResponse.json({ error: "Failed to save risk profile" }, { status: 500 });
  }

  if (outcome.created) {
    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.RISK_PROFILE_UPDATED,
      resourceType: "risk_profile",
      resourceId: auth.userId,
      metadata: { created: true, fields: parsed.data },
      request,
    });
  } else if (Object.keys(outcome.changes).length > 0) {
    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.RISK_PROFILE_UPDATED,
      resourceType: "risk_profile",
      resourceId: auth.userId,
      metadata: { changes: outcome.changes },
      request,
    });
  }

  return NextResponse.json({ profile: outcome.profile });
}
