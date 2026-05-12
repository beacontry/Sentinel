// GET  /api/me/digest-email — current opt-in state + delivery address
// PATCH /api/me/digest-email — toggle opt-in
//
// The market-digest cron checks this column on every fan-out. Email
// only goes to opted-in users (defaults false). Delivery address is
// notificationEmail when set, otherwise the user's login email.

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("digest-email-prefs");

const updateSchema = z.object({
  optIn: z.boolean(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [row] = await db
      .select({
        email: users.email,
        notificationEmail: users.notificationEmail,
        digestEmailOptIn: users.digestEmailOptIn,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        optIn: row.digestEmailOptIn,
        // Where the digest would go right now — so the UI can show
        // "Will send to notify@example.com" or similar
        deliveryAddress: row.notificationEmail ?? row.email,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Digest email pref read error");
    return NextResponse.json({ error: "Failed to load preference" }, { status: 500 });
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    await db
      .update(users)
      .set({ digestEmailOptIn: parsed.data.optIn, updatedAt: new Date() })
      .where(eq(users.id, auth.userId));

    return NextResponse.json({ success: true, optIn: parsed.data.optIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Digest email pref update error");
    return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
  }
}
