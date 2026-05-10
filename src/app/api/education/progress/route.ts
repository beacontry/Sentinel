import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { educationGuideViews } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { GUIDES } from "@/lib/education/guides-data";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("education-progress");

/**
 * Per-user education progress: list of viewed guide slugs with metadata,
 * plus a quick percentage summary.
 *
 * Returns 200 with empty progress array for anonymous callers — the page
 * is publicly browsable; we just don't track without auth.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({
      progress: [],
      totalGuides: GUIDES.length,
      readCount: 0,
      bookmarkCount: 0,
      passedQuizCount: 0,
    });
  }

  try {
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(educationGuideViews)
        .where(eq(educationGuideViews.userId, session.userId))
        .orderBy(desc(educationGuideViews.lastViewedAt));
    });

    // Filter out rows for guides that no longer exist (slug deleted from data
    // but row still in DB).
    const knownSlugs = new Set(GUIDES.map((g) => g.slug));
    const progress = rows
      .filter((r) => knownSlugs.has(r.slug))
      .map((r) => ({
        slug: r.slug,
        viewCount: r.viewCount,
        firstViewedAt: r.firstViewedAt.toISOString(),
        lastViewedAt: r.lastViewedAt.toISOString(),
        bookmarked: r.bookmarked,
        quizScore: r.quizScore,
        quizTotal: r.quizTotal,
        quizPassedAt: r.quizPassedAt?.toISOString() ?? null,
        quizAttempts: r.quizAttempts,
      }));

    return NextResponse.json({
      progress,
      totalGuides: GUIDES.length,
      readCount: progress.length,
      bookmarkCount: progress.filter((p) => p.bookmarked).length,
      passedQuizCount: progress.filter((p) => p.quizPassedAt !== null).length,
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Progress fetch failed");
    return NextResponse.json(
      { error: "Failed to load progress" },
      { status: 500 },
    );
  }
}
