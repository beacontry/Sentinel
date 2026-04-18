import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { discordWebhooks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createWebhookSchema } from "@/lib/validators";
import { z } from "zod";
import { DISCORD_CONFIG } from "@/lib/config";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhooks = await db
    .select()
    .from(discordWebhooks)
    .where(eq(discordWebhooks.userId, session.userId));

  return NextResponse.json({
    webhooks: webhooks.map((w) => ({
      id: w.id,
      name: w.name,
      webhookUrl: w.webhookUrl,
      channelName: w.channelName,
      minSignalStrength: w.minSignalStrength,
      symbols: w.symbols,
      enabled: w.enabled,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createWebhookSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  // Check webhook count limit
  const existing = await db
    .select({ id: discordWebhooks.id })
    .from(discordWebhooks)
    .where(eq(discordWebhooks.userId, session.userId));

  if (existing.length >= DISCORD_CONFIG.maxWebhooksPerUser) {
    return NextResponse.json(
      { error: `Maximum ${DISCORD_CONFIG.maxWebhooksPerUser} webhooks allowed` },
      { status: 400 }
    );
  }

  const [webhook] = await db
    .insert(discordWebhooks)
    .values({
      userId: session.userId,
      name: parsed.data.name,
      webhookUrl: parsed.data.webhookUrl,
      channelName: parsed.data.channelName ?? null,
      minSignalStrength: parsed.data.minSignalStrength,
      symbols: parsed.data.symbols,
    })
    .returning();

  return NextResponse.json(
    {
      webhook: {
        id: webhook.id,
        name: webhook.name,
        webhookUrl: webhook.webhookUrl,
        channelName: webhook.channelName,
        minSignalStrength: webhook.minSignalStrength,
        symbols: webhook.symbols,
        enabled: webhook.enabled,
      },
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const schema = z.object({
    id: z.string().uuid(),
    enabled: z.boolean().optional(),
    minSignalStrength: z.number().int().min(1).max(2).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
  if (parsed.data.minSignalStrength !== undefined)
    updates.minSignalStrength = parsed.data.minSignalStrength;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  await db
    .update(discordWebhooks)
    .set(updates)
    .where(
      and(
        eq(discordWebhooks.id, parsed.data.id),
        eq(discordWebhooks.userId, session.userId)
      )
    );

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const id = body.id;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await db
    .delete(discordWebhooks)
    .where(
      and(
        eq(discordWebhooks.id, id),
        eq(discordWebhooks.userId, session.userId)
      )
    );

  return NextResponse.json({ success: true });
}
