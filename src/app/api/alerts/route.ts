import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { alertRules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { checkTier } from "@/lib/tiers-server";

const createAlertSchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  indicatorField: z.string().min(1).max(100),
  operator: z.string().min(1).max(20),
  value: z.number(),
  channel: z.string().min(1).max(50).default("push"),
});

const updateAlertSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean().optional(),
  indicatorField: z.string().min(1).max(100).optional(),
  value: z.number().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rules = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(alertRules)
        .where(eq(alertRules.userId, session.userId as string))
        .orderBy(alertRules.createdAt);
    });

    return NextResponse.json({
      rules: rules.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        lastTriggered: r.lastTriggered?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  const body = await request.json();
  const parsed = createAlertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [rule] = await db
    .insert(alertRules)
    .values({
      userId: auth.userId,
      ...parsed.data,
    })
    .returning();

  return NextResponse.json({ rule }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const parsed = updateAlertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
  if (parsed.data.indicatorField) updates.indicatorField = parsed.data.indicatorField;
  if (parsed.data.value !== undefined) updates.value = parsed.data.value;

  await db
    .update(alertRules)
    .set(updates)
    .where(
      and(
        eq(alertRules.id, parsed.data.id),
        eq(alertRules.userId, auth.userId)
      )
    );

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const id = body.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await db
    .delete(alertRules)
    .where(
      and(
        eq(alertRules.id, id),
        eq(alertRules.userId, auth.userId)
      )
    );

  return NextResponse.json({ success: true });
}
