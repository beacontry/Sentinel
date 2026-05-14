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

const log = createRouteLogger("broker-connections");

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

  try {
    const [connection] = await db
      .insert(brokerConnections)
      .values({
        userId: auth.userId,
        broker: parsed.data.broker,
        label: parsed.data.label,
        apiKey: encrypt(parsed.data.apiKey),
        apiSecret: encrypt(parsed.data.apiSecret),
        environment: parsed.data.environment,
      })
      .returning();

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
    if (message.includes("broker_connections_user_broker_env_idx")) {
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

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.apiKey !== undefined) updates.apiKey = encrypt(parsed.data.apiKey);
  if (parsed.data.apiSecret !== undefined) updates.apiSecret = encrypt(parsed.data.apiSecret);
  if (parsed.data.environment !== undefined) updates.environment = parsed.data.environment;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(brokerConnections)
      .set(updates)
      .where(
        and(
          eq(brokerConnections.id, parsed.data.id),
          eq(brokerConnections.userId, auth.userId)
        )
      )
      .returning();

    if (!updated) {
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
