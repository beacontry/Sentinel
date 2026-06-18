// PATCH /api/admin/users/[id]/tier
//
// Admin-only manual tier grant for a user. Phase 1 — operates before
// Stripe integration ships. Lets admins promote beta users to Premium
// (or Enterprise) without payment, and downgrade if needed.
//
// Every tier change writes a hash-chained audit row (USER_TIER_CHANGED)
// capturing { actorUserId, targetUserId, fromTier, toTier, reason }.
// When Stripe webhooks land in Phase 2, they'll write the same audit
// action — so we have a unified audit trail across manual + automated
// tier transitions.

import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { writeAudit, AuditAction } from "@/lib/audit";
import { isTier, type Tier } from "@/lib/tiers";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("admin/users/tier");

const patchSchema = z.object({
  tier: z.string(),
  // Optional admin note — captured in the audit row for context
  // (e.g. "Beta invite, 90-day trial" / "Refund, demoting").
  reason: z.string().max(280).optional(),
  // Optional expiry — for time-limited grants (90-day trial,
  // promotional periods). null/missing = no expiry.
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  // Strict UUID (audit #80) — the old /^[0-9a-f-]{36}$/ accepted any 36-char
  // hex/dash soup (e.g. all-dashes), not a well-formed UUID.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  if (!isTier(parsed.data.tier)) {
    return NextResponse.json(
      { error: "Invalid tier — must be one of: free, trader, premium, enterprise" },
      { status: 400 }
    );
  }
  const newTier: Tier = parsed.data.tier;

  // Read current tier so we can include it in the audit row.
  const [target] = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const oldTier = target.tier;
  if (oldTier === newTier) {
    return NextResponse.json({ success: true, unchanged: true, tier: newTier });
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

  try {
    await db
      .update(users)
      .set({
        tier: newTier,
        tierChangedAt: new Date(),
        tierExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.USER_TIER_CHANGED,
      resourceType: "user",
      resourceId: id,
      metadata: {
        fromTier: oldTier,
        toTier: newTier,
        reason: parsed.data.reason ?? null,
        expiresAt: expiresAt?.toISOString() ?? null,
        manual: true, // distinguish from future Stripe-webhook-driven changes
      },
      request,
    });

    return NextResponse.json({
      success: true,
      tier: newTier,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", id, newTier },
      "Failed to update user tier"
    );
    return NextResponse.json({ error: "Failed to update tier" }, { status: 500 });
  }
}
