/**
 * Phase 13 — admin route to toggle a user's live_trading_enabled flag.
 *
 * Admin-only. Audited as `engine.live_blocked` would be one side, but we
 * record this as `risk_profile.updated` style with a "live_grant" metadata
 * marker so the trail is clear (both grant + revoke).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("admin/user-live-trading");

const schema = z.object({
  targetUserId: z.string().uuid(),
  enabled: z.boolean(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { targetUserId, enabled } = parsed.data;

  try {
    const [target] = await db
      .select({ id: users.id, email: users.email, name: users.name, previous: users.liveTradingEnabled })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.previous === enabled) {
      // No-op, but still respond cleanly
      return NextResponse.json({ targetUserId, liveTradingEnabled: enabled, unchanged: true });
    }

    await db
      .update(users)
      .set({ liveTradingEnabled: enabled, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    log.warn(
      { adminUserId: auth.userId, targetUserId, targetEmail: target.email, enabled, previous: target.previous },
      "Admin toggled user.live_trading_enabled"
    );

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: "user.live_trading_toggled",
      resourceType: "user",
      resourceId: targetUserId,
      metadata: {
        targetUserId,
        targetEmail: target.email,
        targetName: target.name,
        previous: target.previous,
        newValue: enabled,
      },
      request,
    });

    return NextResponse.json({ targetUserId, liveTradingEnabled: enabled });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", targetUserId, adminUserId: auth.userId },
      "Failed to toggle live trading flag"
    );
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
