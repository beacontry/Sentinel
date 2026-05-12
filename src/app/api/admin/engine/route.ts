/**
 * Admin engine override.
 *
 * GET  /api/admin/engine
 *   List every user's engine status + active broker connection. Admin overview
 *   for "who is running what."
 *
 * POST /api/admin/engine
 *   Start/stop/halt/switch a SPECIFIC user's engine on their behalf. Admin
 *   acts; audit log records admin as actor + target user in metadata so the
 *   trail is unambiguous. Useful for clearing stuck halts, emergency stops,
 *   or assisting users who don't understand the audit log.
 *
 * Both routes require admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { users, brokerConnections } from "@/lib/db/schema";
import {
  startEngine,
  stopEngine,
  haltEngine,
  peekEngineStatus,
} from "@/lib/trading-engine";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const log = createRouteLogger("admin/engine");

const adminEngineSchema = z.object({
  targetUserId: z.string().uuid("targetUserId must be a UUID"),
  action: z.enum(["start", "stop", "halt", "switch"]),
  mode: z
    .enum(["conservative", "moderate", "optimized", "aggressive", "intraday", "tactical", "tactical-smart"])
    .optional()
    .default("optimized"),
});

// ─── GET — Engine status across every user ──────────────────────────────────

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Load every user + their active broker connection (left join via two queries).
    const allUsers = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          liveTradingEnabled: users.liveTradingEnabled,
        })
        .from(users);
    });

    const connections = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          userId: brokerConnections.userId,
          label: brokerConnections.label,
          broker: brokerConnections.broker,
          environment: brokerConnections.environment,
          isActive: brokerConnections.isActive,
          lastConnectedAt: brokerConnections.lastConnectedAt,
        })
        .from(brokerConnections)
        .where(eq(brokerConnections.isActive, true));
    });

    const connByUserId = new Map<string, (typeof connections)[number]>();
    for (const c of connections) connByUserId.set(c.userId, c);

    const rows = allUsers.map((u) => {
      const engine = peekEngineStatus(u.id);
      const conn = connByUserId.get(u.id) ?? null;
      return {
        user: { id: u.id, name: u.name, email: u.email, role: u.role, liveTradingEnabled: u.liveTradingEnabled },
        engine, // null when user has never started an engine
        connection: conn
          ? {
              label: conn.label,
              broker: conn.broker,
              environment: conn.environment,
              lastConnectedAt: conn.lastConnectedAt?.toISOString() ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to list user engines");
    return NextResponse.json({ error: "Failed to list engines" }, { status: 500 });
  }
}

// ─── POST — Admin acts on a specific user's engine ──────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = adminEngineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { targetUserId, action, mode } = parsed.data;

  // Verify the target user exists.
  const [target] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  // Defense in depth: only proceed if the target has at least one active broker connection.
  if (action === "start" || action === "switch") {
    const [conn] = await db
      .select({ id: brokerConnections.id })
      .from(brokerConnections)
      .where(
        and(
          eq(brokerConnections.userId, targetUserId),
          eq(brokerConnections.isActive, true)
        )
      )
      .limit(1);
    if (!conn) {
      return NextResponse.json(
        { error: "Target user has no active broker connection" },
        { status: 400 }
      );
    }
  }

  log.warn(
    { adminUserId: auth.userId, targetUserId, action, mode },
    "Admin engine override invoked"
  );

  try {
    let result: { ok: boolean; error?: string };

    if (action === "start") {
      result = await startEngine(targetUserId, mode);
    } else if (action === "switch") {
      const status = peekEngineStatus(targetUserId);
      if (status?.running) await stopEngine(targetUserId);
      result = await startEngine(targetUserId, mode);
    } else if (action === "stop") {
      result = await stopEngine(targetUserId);
    } else if (action === "halt") {
      result = await haltEngine(targetUserId);
    } else {
      // unreachable due to zod
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // Audit row: admin is actor; target user + outcome in metadata. Always
    // logged regardless of result.ok so failed overrides are traceable.
    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.ENGINE_ADMIN_OVERRIDE,
      resourceType: "engine",
      resourceId: targetUserId,
      metadata: {
        targetUserId,
        targetUserEmail: target.email,
        targetUserName: target.name,
        engineAction: action,
        mode: action === "start" || action === "switch" ? mode : null,
        ok: result.ok,
        error: result.error ?? null,
      },
      request,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Action failed" }, { status: 400 });
    }

    return NextResponse.json({
      data: {
        targetUserId,
        engine: peekEngineStatus(targetUserId),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, adminUserId: auth.userId, targetUserId, action }, "Admin override threw");
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
