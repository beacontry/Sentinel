// POST /api/broker/connections/[id]/activate
//
// Atomic broker-account switcher. Sets `isActive=true` on the chosen
// connection and `isActive=false` on every other connection owned by
// the same user, inside a single transaction so no scan can ever see
// two actives or zero actives mid-flip.
//
// Refused while the engine is running. Switching the broker mid-session
// would orphan the in-memory positionMap (positions belong to the old
// account but the next scan would query the new one). Easiest correct
// behaviour: tell the user to stop the engine first.

import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { peekEngineStatus } from "@/lib/trading-engine";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("broker-activate");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid connection id" }, { status: 400 });
  }

  // Engine-running gate. Switching active connection while the engine
  // holds an in-memory position map for the old account is a recipe for
  // phantom-position drift. Force the user to stop first.
  const status = peekEngineStatus(auth.userId);
  if (status?.running) {
    return NextResponse.json(
      {
        error: "Stop the engine before switching broker accounts.",
        code: "ENGINE_RUNNING",
      },
      { status: 409 }
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Verify ownership + capture metadata for audit
      const [target] = await tx
        .select()
        .from(brokerConnections)
        .where(
          and(
            eq(brokerConnections.id, id),
            eq(brokerConnections.userId, auth.userId)
          )
        )
        .limit(1);
      if (!target) throw new Error("NOT_FOUND");

      // Demote every OTHER connection owned by this user
      await tx
        .update(brokerConnections)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(brokerConnections.userId, auth.userId),
            ne(brokerConnections.id, id)
          )
        );

      // Promote the chosen one (no-op if already active)
      const [updated] = await tx
        .update(brokerConnections)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(brokerConnections.id, id))
        .returning();

      return { previous: target, current: updated };
    });

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.BROKER_CONNECTION_UPDATED,
      resourceType: "broker_connection",
      resourceId: result.current.id,
      metadata: {
        broker: result.current.broker,
        environment: result.current.environment,
        label: result.current.label,
        action: "activated",
      },
      request,
    });

    return NextResponse.json({
      success: true,
      connection: {
        id: result.current.id,
        broker: result.current.broker,
        label: result.current.label,
        environment: result.current.environment,
        isActive: result.current.isActive,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    log.error({ err: message, connectionId: id }, "Broker activate error");
    return NextResponse.json({ error: "Failed to switch broker" }, { status: 500 });
  }
}
