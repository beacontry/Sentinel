import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { educationGuideViews } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { getGuideBySlug } from "@/lib/education/guides-data";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("education-guide-view");

/**
 * Mark a guide as viewed for the authenticated user.
 *
 * Upsert on (user_id, slug):
 *   - First view: insert with view_count = 1
 *   - Subsequent: bump view_count, refresh last_viewed_at
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;

  // Validate slug against the in-memory guide registry — never accept arbitrary
  // strings into the DB.
  if (!getGuideBySlug(slug)) {
    return NextResponse.json({ error: "Unknown guide" }, { status: 404 });
  }

  try {
    const [row] = await db
      .insert(educationGuideViews)
      .values({
        userId: auth.userId,
        slug,
        viewCount: 1,
      })
      .onConflictDoUpdate({
        target: [educationGuideViews.userId, educationGuideViews.slug],
        set: {
          viewCount: sql`${educationGuideViews.viewCount} + 1`,
          lastViewedAt: sql`now()`,
        },
      })
      .returning();

    return NextResponse.json({
      slug,
      viewCount: row.viewCount,
      firstViewedAt: row.firstViewedAt.toISOString(),
      lastViewedAt: row.lastViewedAt.toISOString(),
      bookmarked: row.bookmarked,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, slug }, "Guide view record failed");
    return NextResponse.json(
      { error: "Failed to record view" },
      { status: 500 },
    );
  }
}
