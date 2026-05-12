/**
 * Phase 19 — user's own leaderboard opt-in preferences.
 *
 * GET  /api/leaderboard/preferences — returns { optIn, displayName }
 * PUT  /api/leaderboard/preferences — body: { optIn: boolean, displayName?: string|null }
 *
 * Each user manages their own visibility; admins can't force-opt-in others.
 */

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  optIn: z.boolean(),
  displayName: z.string().min(1).max(40).nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [u] = await db
    .select({ optIn: users.leaderboardOptIn, displayName: users.leaderboardDisplayName })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return NextResponse.json({
    optIn: u?.optIn ?? false,
    displayName: u?.displayName ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  // Sanitize display name — strip control chars, trim, no leading/trailing whitespace
  const cleanedDisplayName =
    parsed.data.displayName === undefined
      ? undefined
      : parsed.data.displayName === null
        ? null
        : parsed.data.displayName.replace(/[\x00-\x1f\x7f]/g, "").trim();

  await db
    .update(users)
    .set({
      leaderboardOptIn: parsed.data.optIn,
      ...(cleanedDisplayName !== undefined ? { leaderboardDisplayName: cleanedDisplayName } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, auth.userId));

  return NextResponse.json({ optIn: parsed.data.optIn, displayName: cleanedDisplayName ?? null });
}
