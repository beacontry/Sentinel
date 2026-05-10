import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { educationGuideViews } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getGuideBySlug } from "@/lib/education/guides-data";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("education-guide-bookmark");

/**
 * Toggle bookmark on a guide for the authenticated user.
 *
 * Body: { bookmarked: boolean }
 * Creates the row if it doesn't exist (a bookmark also counts as a "view").
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

  let body: { bookmarked?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bookmarked = body.bookmarked === true;

  try {
    const [row] = await db
      .insert(educationGuideViews)
      .values({
        userId: auth.userId,
        slug,
        bookmarked,
      })
      .onConflictDoUpdate({
        target: [educationGuideViews.userId, educationGuideViews.slug],
        set: { bookmarked },
      })
      .returning();

    return NextResponse.json({
      slug,
      bookmarked: row.bookmarked,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, slug }, "Bookmark toggle failed");
    return NextResponse.json(
      { error: "Failed to update bookmark" },
      { status: 500 },
    );
  }
}

/**
 * DELETE removes the bookmark explicitly (sugar over POST {bookmarked:false}).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { slug } = await params;
  if (!getGuideBySlug(slug)) {
    return NextResponse.json({ error: "Unknown guide" }, { status: 404 });
  }

  try {
    await db
      .update(educationGuideViews)
      .set({ bookmarked: false })
      .where(
        and(
          eq(educationGuideViews.userId, auth.userId),
          eq(educationGuideViews.slug, slug),
        ),
      );
    return NextResponse.json({ slug, bookmarked: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, slug }, "Bookmark delete failed");
    return NextResponse.json(
      { error: "Failed to remove bookmark" },
      { status: 500 },
    );
  }
}
