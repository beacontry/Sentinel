import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { glossaryReviewState } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { GLOSSARY_TERMS } from "@/lib/glossary-data";
import {
  applyReview,
  initialState,
} from "@/lib/education/spaced-repetition";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("education-review");

/**
 * GET /api/education/review
 *   Returns the user's review queue:
 *     - dueTerms: term IDs with nextReviewAt <= now
 *     - newTerms: glossary terms not yet reviewed (capped at limit)
 *     - upcomingCount: how many are due in the next 7 days
 *
 *   For anonymous users, returns empty queue (page is browsable but reviews
 *   aren't recorded).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({
      dueTerms: [],
      newTerms: GLOSSARY_TERMS.slice(0, 5).map((t) => t.id),
      upcomingCount: 0,
      totalReviewed: 0,
      totalTerms: GLOSSARY_TERMS.length,
      anonymous: true,
    });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(5, Number(searchParams.get("limit") ?? 20)));

  try {
    const now = new Date();
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(glossaryReviewState)
        .where(eq(glossaryReviewState.userId, session.userId));
    });

    const reviewedSet = new Set(rows.map((r) => r.termId));
    const validTermIds = new Set(GLOSSARY_TERMS.map((t) => t.id));

    // Filter out reviews for terms that no longer exist (renamed/deleted)
    const validRows = rows.filter((r) => validTermIds.has(r.termId));

    const due = validRows
      .filter((r) => r.nextReviewAt.getTime() <= now.getTime())
      .sort((a, b) => a.nextReviewAt.getTime() - b.nextReviewAt.getTime());

    const upcoming = validRows.filter((r) => {
      const ms = r.nextReviewAt.getTime() - now.getTime();
      return ms > 0 && ms <= 7 * 86400 * 1000;
    });

    const newTerms = GLOSSARY_TERMS.filter((t) => !reviewedSet.has(t.id));

    return NextResponse.json({
      dueTerms: due.slice(0, limit).map((r) => r.termId),
      newTerms: newTerms.slice(0, Math.max(0, limit - due.length)).map((t) => t.id),
      upcomingCount: upcoming.length,
      totalReviewed: validRows.length,
      totalTerms: GLOSSARY_TERMS.length,
      anonymous: false,
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Review queue fetch failed");
    return NextResponse.json(
      { error: "Failed to load review queue" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/education/review
 *   Body: { termId: string, quality: 0..5 }
 *   Records a review and computes next review state via SM-2.
 *   Upserts on (user_id, term_id).
 */
export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: { termId?: unknown; quality?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const termId = String(body.termId ?? "");
  const quality = Number(body.quality);

  if (!GLOSSARY_TERMS.some((t) => t.id === termId)) {
    return NextResponse.json({ error: "Unknown term" }, { status: 404 });
  }
  if (!Number.isFinite(quality) || quality < 0 || quality > 5) {
    return NextResponse.json({ error: "Quality must be 0-5" }, { status: 400 });
  }

  try {
    // Read existing state (if any) to compute next state. We use the read-then-
    // upsert pattern rather than computing in SQL — the SM-2 formula is in TS.
    const [existing] = await db
      .select()
      .from(glossaryReviewState)
      .where(
        and(
          eq(glossaryReviewState.userId, auth.userId),
          eq(glossaryReviewState.termId, termId),
        ),
      )
      .limit(1);

    const prev = existing
      ? {
          easeFactor: existing.easeFactor,
          intervalDays: existing.intervalDays,
          reviewCount: existing.reviewCount,
          lapses: existing.lapses,
        }
      : initialState();

    const result = applyReview(prev, quality);

    const [row] = await db
      .insert(glossaryReviewState)
      .values({
        userId: auth.userId,
        termId,
        easeFactor: result.easeFactor,
        intervalDays: result.intervalDays,
        reviewCount: result.reviewCount,
        lapses: result.lapses,
        lastQuality: Math.floor(quality),
        lastReviewedAt: new Date(),
        nextReviewAt: result.nextReviewAt,
      })
      .onConflictDoUpdate({
        target: [glossaryReviewState.userId, glossaryReviewState.termId],
        set: {
          easeFactor: result.easeFactor,
          intervalDays: result.intervalDays,
          reviewCount: result.reviewCount,
          lapses: result.lapses,
          lastQuality: Math.floor(quality),
          lastReviewedAt: sql`now()`,
          nextReviewAt: result.nextReviewAt,
        },
      })
      .returning();

    return NextResponse.json({
      termId,
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
      nextReviewAt: row.nextReviewAt.toISOString(),
      reviewCount: row.reviewCount,
      lapses: row.lapses,
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, termId }, "Review record failed");
    return NextResponse.json(
      { error: "Failed to record review" },
      { status: 500 },
    );
  }
}
