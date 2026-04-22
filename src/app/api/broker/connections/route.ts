import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createBrokerConnectionSchema,
  updateBrokerConnectionSchema,
  deleteBrokerConnectionSchema,
} from "@/lib/validators";
import { encrypt } from "@/lib/crypto";
import { requireCsrf } from "@/lib/csrf";
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
    const connections = await db
      .select()
      .from(brokerConnections)
      .where(eq(brokerConnections.userId, session.userId));

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
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Failed to list broker connections");
    return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const csrfError = await requireCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
        userId: session.userId,
        broker: parsed.data.broker,
        label: parsed.data.label,
        apiKey: encrypt(parsed.data.apiKey),
        apiSecret: encrypt(parsed.data.apiSecret),
        environment: parsed.data.environment,
      })
      .returning();

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
  const csrfError = await requireCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
          eq(brokerConnections.userId, session.userId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

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
  const csrfError = await requireCsrf(request);
  if (csrfError) return csrfError;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
          eq(brokerConnections.userId, session.userId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Failed to delete broker connection");
    return NextResponse.json({ error: "Failed to delete connection" }, { status: 500 });
  }
}
