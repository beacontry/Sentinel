import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { educationGuideViews } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { getGuideBySlug } from "@/lib/education/guides-data";
import { getQuizForGuide } from "@/lib/education/quizzes-data";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("education-guide-quiz");

const PASS_PCT = 0.8;

/**
 * Submit a quiz attempt for a guide.
 *
 * Body: { score: number, total: number }
 *
 * Behavior:
 *   - Upserts on (user_id, slug); creates a view row if none exists
 *     (also bumps view_count to 1).
 *   - Updates quiz_score and quiz_total to most-recent attempt values.
 *   - Bumps quiz_attempts.
 *   - Sets quiz_passed_at to now() ONLY on the first time the user passes
 *     (>= 80%). Never overwritten on subsequent attempts.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  if (!getGuideBySlug(slug)) {
    return NextResponse.json({ error: "Unknown guide" }, { status: 404 });
  }
  const quiz = getQuizForGuide(slug);
  if (!quiz || quiz.length === 0) {
    return NextResponse.json({ error: "Guide has no quiz" }, { status: 400 });
  }

  let body: { score?: unknown; total?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const score = Number(body.score);
  const total = Number(body.total);

  if (
    !Number.isInteger(score) ||
    !Number.isInteger(total) ||
    score < 0 ||
    total <= 0 ||
    score > total ||
    total !== quiz.length
  ) {
    return NextResponse.json(
      { error: "Invalid score/total" },
      { status: 400 },
    );
  }

  const passed = score / total >= PASS_PCT;

  try {
    // Two-arm upsert: only set quiz_passed_at to now() if currently NULL AND
    // this attempt passes. coalesce keeps any prior pass timestamp.
    const [row] = await db
      .insert(educationGuideViews)
      .values({
        userId: auth.userId,
        slug,
        viewCount: 1,
        quizScore: score,
        quizTotal: total,
        quizAttempts: 1,
        quizPassedAt: passed ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [educationGuideViews.userId, educationGuideViews.slug],
        set: {
          quizScore: score,
          quizTotal: total,
          quizAttempts: sql`${educationGuideViews.quizAttempts} + 1`,
          // Keep the first pass timestamp; only set if currently null AND passing now.
          quizPassedAt: passed
            ? sql`COALESCE(${educationGuideViews.quizPassedAt}, now())`
            : educationGuideViews.quizPassedAt,
          lastViewedAt: sql`now()`,
        },
      })
      .returning();

    return NextResponse.json({
      slug,
      score: row.quizScore,
      total: row.quizTotal,
      passed: row.quizPassedAt !== null,
      passedAt: row.quizPassedAt?.toISOString() ?? null,
      attempts: row.quizAttempts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, slug }, "Quiz submit failed");
    return NextResponse.json(
      { error: "Failed to record quiz" },
      { status: 500 },
    );
  }
}
