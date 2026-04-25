import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { articles, articlePurchases, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("articles-detail");

const PREVIEW_LENGTH = 500;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  try {
    const { article, hasPurchased } = await withTimeout(3000, async (tx) => {
      const [article] = await tx
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          body: articles.body,
          category: articles.category,
          price: articles.price,
          publishedAt: articles.publishedAt,
          authorId: articles.authorId,
          authorName: users.name,
        })
        .from(articles)
        .leftJoin(users, eq(articles.authorId, users.id))
        .where(eq(articles.slug, slug))
        .limit(1);

      if (!article) {
        return { article: null, hasPurchased: false };
      }

      // Check if article is free or user has purchased it
      const isFree = !article.price || article.price === 0;
      const isAuthor = article.authorId === session.userId;
      const isAdmin = session.role === "admin";

      let hasPurchased = false;
      if (!isFree && !isAuthor && !isAdmin) {
        const [purchase] = await tx
          .select({ id: articlePurchases.id })
          .from(articlePurchases)
          .where(
            and(
              eq(articlePurchases.userId, session.userId as string),
              eq(articlePurchases.articleId, article.id)
            )
          )
          .limit(1);

        hasPurchased = !!purchase;
      }

      return { article, hasPurchased };
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const isFree = !article.price || article.price === 0;
    const isAuthor = article.authorId === session.userId;
    const isAdmin = session.role === "admin";
    const canAccessFull = isFree || isAuthor || isAdmin || hasPurchased;

    return NextResponse.json(
      {
        article: {
          ...article,
          publishedAt: article.publishedAt?.toISOString() ?? null,
          body: canAccessFull
            ? article.body
            : article.body.slice(0, PREVIEW_LENGTH) + "...",
          locked: !canAccessFull,
          hasPurchased,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Article detail error");
    return NextResponse.json(
      { error: "Failed to load article" },
      { status: 500 }
    );
  }
}
