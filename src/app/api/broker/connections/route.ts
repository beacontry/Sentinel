import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createBrokerConnectionSchema,
  updateBrokerConnectionSchema,
  deleteBrokerConnectionSchema,
} from "@/lib/validators";
import { encrypt } from "@/lib/crypto";
import { writeAudit, AuditAction } from "@/lib/audit";

import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("broker-connections");

// Migration 0049: at most one active connection per user.
const ONE_ACTIVE_INDEX = "broker_connections_one_active_per_user_idx";
const USER_BROKER_ENV_INDEX = "broker_connections_user_broker_env_idx";

// Drizzle wraps the driver error ("Failed query: ..."), so the constraint
// name is on err.cause, not in err.message. Check both.
function violatesIndex(err: unknown, index: string): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes(index)) return true;
  const cause = err.cause as { message?: unknown; constraint_name?: unknown } | undefined;
  return (
    cause?.constraint_name === index ||
    (typeof cause?.message === "string" && cause.message.includes(index))
  );
}

function maskSecret(_secret: string): string {
  return "••••••••";
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connections = await withTimeout(3000, (tx) =>
      tx
        .select()
        .from(brokerConnections)
        .where(eq(brokerConnections.userId, session.userId))
    );

    return NextResponse.json({
      connections: connections.map((c) => ({
        id: c.id,
        broker: c.broker,
        label: c.label,
        apiKey: maskSecret(c.apiKey),
        apiSecret: maskSecret(c.apiSecret),
        environment: c.environment,
        isActive: c.isActive,
        lastConnectedAt: c.lastConnectedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      log.warn({ userId: session.userId }, "broker_connections list timed out");
      return NextResponse.json(
        { error: "Query timed out — please retry" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Failed to list broker connections");
    return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

  const parsed = createBrokerConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const insertConnection = (isActive: boolean) =>
    db
      .insert(brokerConnections)
      .values({
        userId: auth.userId,
        broker: parsed.data.broker,
        label: parsed.data.label,
        apiKey: encrypt(parsed.data.apiKey),
        apiSecret: encrypt(parsed.data.apiSecret),
        environment: parsed.data.environment,
        isActive,
      })
      .returning();

  try {
    // Only a user's first connection starts active. Adding another never
    // changes the account the engine, the kill switch and manual orders act
    // on: the user switches with /activate, which refuses while the engine
    // runs. Before this every new row was active, so a user could hold a
    // paper and a live connection active at once.
    const [existingActive] = await db
      .select({ id: brokerConnections.id })
      .from(brokerConnections)
      .where(
        and(
          eq(brokerConnections.userId, auth.userId),
          eq(brokerConnections.isActive, true)
        )
      )
      .limit(1);

    let connection: typeof brokerConnections.$inferSelect;
    try {
      [connection] = await insertConnection(!existingActive);
    } catch (err) {
      // A concurrent add activated another row first: keep this one inactive.
      if (existingActive || !violatesIndex(err, ONE_ACTIVE_INDEX)) throw err;
      [connection] = await insertConnection(false);
    }

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.BROKER_CONNECTION_CREATED,
      resourceType: "broker_connection",
      resourceId: connection.id,
      metadata: {
        broker: connection.broker,
        environment: connection.environment,
        label: connection.label,
      },
      request,
    });

    return NextResponse.json(
      {
        connection: {
          id: connection.id,
          broker: connection.broker,
          label: connection.label,
          apiKey: maskSecret(connection.apiKey),
          apiSecret: maskSecret(connection.apiSecret),
          environment: connection.environment,
          isActive: connection.isActive,
          lastConnectedAt: connection.lastConnectedAt,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Unique constraint violation — user already has this broker+env
    if (violatesIndex(err, USER_BROKER_ENV_INDEX)) {
      return NextResponse.json(
        { error: "A connection for this broker and environment already exists" },
        { status: 409 }
      );
    }
    log.error({ err: message }, "Failed to create broker connection");
    return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateBrokerConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  // Which connection is active is changed only by /activate, which demotes
  // the others in one transaction and refuses while the engine runs. Setting
  // isActive here bypassed both, and could leave two connections active or
  // deactivate the one a running engine and its kill switch resolve.
  if (parsed.data.isActive !== undefined) {
    return NextResponse.json(
      {
        error: "Switch the active broker account with the account switcher, not an edit.",
        code: "USE_ACTIVATE",
        retryable: false,
      },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.apiKey !== undefined) updates.apiKey = encrypt(parsed.data.apiKey);
  if (parsed.data.apiSecret !== undefined) updates.apiSecret = encrypt(parsed.data.apiSecret);
  if (parsed.data.environment !== undefined) updates.environment = parsed.data.environment;

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  // Changing the environment turns the account every caller acts on from
  // paper to live (or back) without /activate or its engine gate, so it is
  // allowed only on an inactive connection. Fenced in the statement, not
  // checked before it, so an activation in between cannot slip past.
  const changesEnvironment = parsed.data.environment !== undefined;

  try {
    const [updated] = await db
      .update(brokerConnections)
      .set(updates)
      .where(
        and(
          eq(brokerConnections.id, parsed.data.id),
          eq(brokerConnections.userId, auth.userId),
          ...(changesEnvironment ? [eq(brokerConnections.isActive, false)] : [])
        )
      )
      .returning();

    if (!updated) {
      if (changesEnvironment) {
        const [existing] = await db
          .select({ id: brokerConnections.id })
          .from(brokerConnections)
          .where(
            and(
              eq(brokerConnections.id, parsed.data.id),
              eq(brokerConnections.userId, auth.userId)
            )
          )
          .limit(1);
        if (existing) {
          return NextResponse.json(
            {
              error:
                "This is your active broker account. Add a new connection for the other environment, or switch to another account before changing this one.",
              code: "CONNECTION_ACTIVE",
              retryable: false,
            },
            { status: 409 }
          );
        }
      }
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Track which fields changed; never log raw secrets, only that they rotated.
    const changedFields = Object.keys(updates).filter((k) => k !== "updatedAt");
    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.BROKER_CONNECTION_UPDATED,
      resourceType: "broker_connection",
      resourceId: updated.id,
      metadata: {
        broker: updated.broker,
        environment: updated.environment,
        changedFields,
        rotatedSecrets:
          changedFields.includes("apiKey") || changedFields.includes("apiSecret"),
      },
      request,
    });

    return NextResponse.json({
      connection: {
        id: updated.id,
        broker: updated.broker,
        label: updated.label,
        apiKey: maskSecret(updated.apiKey),
        apiSecret: maskSecret(updated.apiSecret),
        environment: updated.environment,
        isActive: updated.isActive,
        lastConnectedAt: updated.lastConnectedAt,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (violatesIndex(err, USER_BROKER_ENV_INDEX)) {
      return NextResponse.json(
        { error: "A connection for this broker and environment already exists" },
        { status: 409 }
      );
    }
    log.error({ err: message }, "Failed to update broker connection");
    return NextResponse.json({ error: "Failed to update connection" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = deleteBrokerConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(brokerConnections)
      .where(
        and(
          eq(brokerConnections.id, parsed.data.id),
          eq(brokerConnections.userId, auth.userId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.BROKER_CONNECTION_DELETED,
      resourceType: "broker_connection",
      resourceId: deleted.id,
      metadata: { broker: deleted.broker, environment: deleted.environment },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Failed to delete broker connection");
    return NextResponse.json({ error: "Failed to delete connection" }, { status: 500 });
  }
}
