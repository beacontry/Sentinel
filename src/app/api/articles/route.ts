import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { articles, users } from "@/lib/db/schema";
import { eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("articles");

const createArticleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  body: z.string().min(1, "Body is required").max(50000),
  category: z.string().max(50).optional(),
  price: z.number().min(0).max(1000).default(0),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(10, Number(searchParams.get("limit")) || 20));
  const offset = (page - 1) * limit;

  try {
    const articleList = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        category: articles.category,
        price: articles.price,
        publishedAt: articles.publishedAt,
        authorId: articles.authorId,
        authorName: users.name,
      })
      .from(articles)
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(isNotNull(articles.publishedAt))
      .orderBy(sql`${articles.publishedAt} DESC`)
      .limit(limit)
      .offset(offset);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(articles)
      .where(isNotNull(articles.publishedAt));

    const total = countResult?.count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        articles: articleList.map((a) => ({
          ...a,
          publishedAt: a.publishedAt?.toISOString() ?? null,
        })),
        page,
        totalPages,
      },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Articles list error");
    return NextResponse.json(
      { error: "Failed to load articles" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin only
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createArticleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const [article] = await db
      .insert(articles)
      .values({
        authorId: session.userId as string,
        title: parsed.data.title,
        slug: parsed.data.slug,
        body: parsed.data.body,
        category: parsed.data.category ?? null,
        price: parsed.data.price,
        publishedAt: new Date(),
      })
      .returning();

    return NextResponse.json({ article }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "An article with this slug already exists" },
        { status: 409 }
      );
    }
    log.error({ err: message }, "Article create error");
    return NextResponse.json(
      { error: "Failed to create article" },
      { status: 500 }
    );
  }
}
