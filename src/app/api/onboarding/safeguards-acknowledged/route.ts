/**
 * Onboarding — record that the user has seen and acknowledged the trading
 * safeguards modal. One-way switch (no UN-acknowledge).
 *
 * GET  /api/onboarding/safeguards-acknowledged — returns { acknowledged: bool, at: iso|null }
 * PUT  /api/onboarding/safeguards-acknowledged — sets users.safeguards_acknowledged_at = NOW() for the session user
 */

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("onboarding/safeguards");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [row] = await db
      .select({ at: users.safeguardsAcknowledgedAt })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    return NextResponse.json({
      acknowledged: row?.at != null,
      at: row?.at?.toISOString() ?? null,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to load safeguards ack state");
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  try {
    const now = new Date();
    await db
      .update(users)
      .set({ safeguardsAcknowledgedAt: now, updatedAt: now })
      .where(eq(users.id, auth.userId));
    return NextResponse.json({ acknowledged: true, at: now.toISOString() });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", userId: auth.userId },
      "Failed to record safeguards acknowledgment"
    );
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
