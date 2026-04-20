import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { savedStrategies } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  createStrategySchema,
  updateStrategySchema,
  deleteStrategySchema,
} from "@/lib/validators";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("strategies");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const strategies = await db
      .select()
      .from(savedStrategies)
      .where(eq(savedStrategies.userId, session.userId))
      .orderBy(desc(savedStrategies.createdAt))
      .limit(50);

    return NextResponse.json({
      strategies: strategies.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        lastRunAt: s.lastRunAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Strategies list error");
    return NextResponse.json({ error: "Failed to load strategies" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createStrategySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const [strategy] = await db
      .insert(savedStrategies)
      .values({
        userId: session.userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        config: parsed.data.config,
      })
      .returning();

    return NextResponse.json(
      {
        strategy: {
          ...strategy,
          createdAt: strategy.createdAt.toISOString(),
          lastRunAt: strategy.lastRunAt?.toISOString() ?? null,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Strategy create error");
    return NextResponse.json({ error: "Failed to create strategy" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateStrategySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    // Verify ownership
    const existing = await db
      .select({ userId: savedStrategies.userId })
      .from(savedStrategies)
      .where(eq(savedStrategies.id, parsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing[0].userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.config !== undefined) updates.config = parsed.data.config;
    if (parsed.data.lastRunAt !== undefined) updates.lastRunAt = new Date(parsed.data.lastRunAt);
    if (parsed.data.lastResult !== undefined) updates.lastResult = parsed.data.lastResult;

    const [updated] = await db
      .update(savedStrategies)
      .set(updates)
      .where(eq(savedStrategies.id, parsed.data.id))
      .returning();

    return NextResponse.json({
      strategy: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        lastRunAt: updated.lastRunAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Strategy update error");
    return NextResponse.json({ error: "Failed to update strategy" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = deleteStrategySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    // Verify ownership
    const existing = await db
      .select({ userId: savedStrategies.userId })
      .from(savedStrategies)
      .where(eq(savedStrategies.id, parsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing[0].userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db
      .delete(savedStrategies)
      .where(eq(savedStrategies.id, parsed.data.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Strategy delete error");
    return NextResponse.json({ error: "Failed to delete strategy" }, { status: 500 });
  }
}
