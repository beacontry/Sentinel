// Admin CRUD for the Reddit subreddit list that the Reddit ticker-mention
// feed queries. Surfaced on /dashboard/admin → Reddit Subreddits card.
//
//   GET    /api/admin/reddit-subreddits         → list all (enabled + disabled)
//   POST   /api/admin/reddit-subreddits         → add a new sub
//   PATCH  /api/admin/reddit-subreddits         → update an existing sub
//                                                  (toggle, rename, reweight)
//   DELETE /api/admin/reddit-subreddits?id=...  → remove a sub
//
// Every mutation writes a hash-chained audit row (AuditAction.REDDIT_SUBREDDIT_UPDATED).

import { NextResponse, type NextRequest } from "next/server";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { redditSubreddits } from "@/lib/db/schema/reddit";
import { requireAuthForRead, requireAuthWithCsrf } from "@/lib/auth";
import { writeAudit, AuditAction } from "@/lib/audit";
import { clearRedditCache } from "@/lib/reddit";
import { createRouteLogger } from "@/lib/logger";
import { eq, asc, sql } from "drizzle-orm";
import { z } from "zod";

const log = createRouteLogger("admin/reddit-subreddits");

// Reddit's subreddit naming rules: 3–21 chars, [A-Za-z0-9_]. We're slightly
// lenient on length (some legitimate subs are 2 chars).
const SUB_NAME_RE = /^[A-Za-z0-9_]{2,32}$/;

const createSchema = z.object({
  name: z.string().regex(SUB_NAME_RE, "Invalid subreddit name"),
  displayName: z.string().min(1).max(64).optional(),
  description: z.string().max(280).optional(),
  weight: z.number().min(0).max(2).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(64).optional(),
  description: z.string().max(280).nullable().optional(),
  weight: z.number().min(0).max(2).optional(),
  enabled: z.boolean().optional(),
});

// ─── GET — list all subs (enabled + disabled) ─────────────────────────────

export async function GET() {
  const session = await requireAuthForRead(["admin"]);
  if (session instanceof Response) return session;

  try {
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(redditSubreddits)
        .orderBy(asc(redditSubreddits.name));
    });
    return NextResponse.json({ subreddits: rows });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to list subreddits"
    );
    return NextResponse.json({ error: "Failed to list subreddits" }, { status: 500 });
  }
}

// ─── POST — add a new sub ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const name = parsed.data.name.trim();
  const lowered = name.toLowerCase();
  const displayName = parsed.data.displayName?.trim() || `r/${name}`;
  const description = parsed.data.description?.trim() || null;
  const weight = parsed.data.weight ?? 1.0;

  try {
    // Pre-check for case-insensitive duplicate. The migration enforces a
    // functional unique index on LOWER(name), so a race would still fail
    // — but a clean 409 is friendlier than a 500.
    const existing = await db
      .select({ id: redditSubreddits.id })
      .from(redditSubreddits)
      .where(sql`LOWER(${redditSubreddits.name}) = ${lowered}`)
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `r/${name} is already in the list` },
        { status: 409 }
      );
    }

    const [created] = await db
      .insert(redditSubreddits)
      .values({
        name: lowered, // store canonical lowercase
        displayName,
        description,
        weight: weight.toFixed(2),
        enabled: true,
      })
      .returning();

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.REDDIT_SUBREDDIT_UPDATED,
      resourceType: "reddit_subreddit",
      resourceId: created.id,
      metadata: { op: "add", name: lowered, weight },
      request,
    });

    // Cached fetches reference the previous set of subs — flush so the
    // new addition is visible immediately.
    clearRedditCache();

    return NextResponse.json({ subreddit: created }, { status: 201 });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", name },
      "Failed to add subreddit"
    );
    return NextResponse.json({ error: "Failed to add subreddit" }, { status: 500 });
  }
}

// ─── PATCH — toggle, rename, reweight ─────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
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

  const { id, ...patch } = parsed.data;

  // Build a partial update; only set columns the caller specified so
  // an absent field doesn't accidentally null out a value.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.weight !== undefined) set.weight = patch.weight.toFixed(2);
  if (patch.enabled !== undefined) set.enabled = patch.enabled;

  if (Object.keys(set).length === 1) {
    // Only `updatedAt` would change — refuse, save a write.
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(redditSubreddits)
      .set(set)
      .where(eq(redditSubreddits.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.REDDIT_SUBREDDIT_UPDATED,
      resourceType: "reddit_subreddit",
      resourceId: id,
      metadata: { op: "update", changes: patch },
      request,
    });

    clearRedditCache();
    return NextResponse.json({ subreddit: updated });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", id },
      "Failed to update subreddit"
    );
    return NextResponse.json({ error: "Failed to update subreddit" }, { status: 500 });
  }
}

// ─── DELETE — remove a sub ────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(redditSubreddits)
      .where(eq(redditSubreddits.id, id))
      .returning({ id: redditSubreddits.id, name: redditSubreddits.name });

    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.REDDIT_SUBREDDIT_UPDATED,
      resourceType: "reddit_subreddit",
      resourceId: id,
      metadata: { op: "delete", name: deleted.name },
      request,
    });

    clearRedditCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", id },
      "Failed to delete subreddit"
    );
    return NextResponse.json({ error: "Failed to delete subreddit" }, { status: 500 });
  }
}
