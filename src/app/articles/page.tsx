// /articles — public reader for free articles + daily market digest.
//
// Server-rendered listing. Only surfaces articles with price = 0 (the
// auto-generated daily digest qualifies; paid editorial content stays
// gated behind the dashboard reader at /dashboard/articles).
//
// This route exists primarily for SEO — the daily digest gives Google
// a steady stream of fresh, dated, market-relevant content under
// beacontry.com/articles, which compounds well over months. Each
// article gets its own canonical URL via /articles/[slug].

import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper, ArrowRight, Calendar } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
import { withTimeout } from "@/lib/db";
import { articles } from "@/lib/db/schema/content";
import { desc, eq, isNotNull, and, lte } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Daily Market Articles & Digests | Beacontry",
  description:
    "Fresh market commentary and the daily Beacontry Desk digest — published every trading day. Free, no signup required.",
  openGraph: {
    title: "Daily Market Articles",
    description: "Daily Beacontry Desk digest and free market commentary.",
    url: "https://beacontry.com/articles",
    siteName: "Beacontry",
  },
  alternates: { canonical: "https://beacontry.com/articles" },
};

// Re-render every 10min. New digest articles land once per trading
// day so this is plenty fast; the ISR cache absorbs the bulk of
// requests between rebuilds.
export const revalidate = 600;

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PublicArticlesPage() {
  // Fetch published free articles (price = 0, publishedAt <= now,
  // notNull). Newest first, capped at 40 to keep the page lean.
  let rows: Array<{
    slug: string;
    title: string;
    category: string | null;
    publishedAt: Date | null;
    body: string;
  }> = [];

  try {
    rows = await withTimeout(5000, async (tx) => {
      return tx
        .select({
          slug: articles.slug,
          title: articles.title,
          category: articles.category,
          publishedAt: articles.publishedAt,
          body: articles.body,
        })
        .from(articles)
        .where(
          and(
            eq(articles.price, 0),
            isNotNull(articles.publishedAt),
            lte(articles.publishedAt, new Date())
          )
        )
        .orderBy(desc(articles.publishedAt))
        .limit(40);
    });
  } catch {
    rows = [];
  }

  // Build a short summary from the body — first paragraph or 240 chars.
  // The body is markdown, so strip the most common control characters.
  const items = rows.map((r) => {
    const firstPara = r.body.split(/\n\s*\n/)[0] ?? "";
    const cleaned = firstPara
      .replace(/^#+\s*/gm, "") // headings
      .replace(/[*_`]/g, "") // emphasis
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // links
      .replace(/\s+/g, " ")
      .trim();
    const summary =
      cleaned.length > 240 ? cleaned.slice(0, 240).trimEnd() + "…" : cleaned;
    return {
      slug: r.slug,
      title: r.title,
      category: r.category,
      publishedAt: r.publishedAt,
      summary,
    };
  });

  const featured = items[0];
  const rest = items.slice(1);

  return (
    <PublicShell active="articles">
      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center justify-center gap-2 rounded-full border border-ld-accent/22 bg-ld-accent/10 px-4 py-1.5 mb-5">
          <Newspaper className="h-4 w-4 text-ld-accent" />
          <span className="font-mono text-xs uppercase tracking-wider text-ld-accent">
            Beacontry Desk
          </span>
        </div>
        <h1 className="text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.05] tracking-tighter mb-4">
          Daily Market Articles
        </h1>
        <p className="mx-auto max-w-[680px] text-lg leading-relaxed text-ld-text-secondary">
          AI-assisted market digest published every trading day, plus longer-form
          commentary on signal patterns and macro themes.
        </p>
      </section>

      {items.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-ld-border bg-ld-card">
          <Newspaper className="h-10 w-10 text-ld-text-muted mx-auto mb-3" />
          <p className="text-ld-text-secondary">
            No articles published yet — check back after the next US market close.
          </p>
        </div>
      ) : (
        <>
          {/* Featured (newest) article */}
          {featured && (
            <Link
              href={`/articles/${featured.slug}`}
              className="group block mb-8 rounded-2xl border border-ld-border bg-ld-card p-8 transition-all duration-200 hover:-translate-y-1 hover:border-ld-accent/30 hover:bg-ld-card-hover hover:shadow-[0_22px_60px_rgba(0,0,0,0.32)]"
            >
              <div className="flex items-center gap-3 mb-4 text-[0.78rem]">
                <span className="rounded-full bg-ld-accent/14 px-2.5 py-0.5 font-mono uppercase tracking-wider text-ld-accent">
                  Latest
                </span>
                {featured.category && (
                  <span className="font-mono uppercase tracking-wider text-ld-text-muted">
                    {featured.category}
                  </span>
                )}
                {featured.publishedAt && (
                  <span className="inline-flex items-center gap-1 text-ld-text-muted">
                    <Calendar className="h-3 w-3" />
                    {fmtDate(featured.publishedAt)}
                  </span>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 group-hover:text-ld-accent transition-colors">
                {featured.title}
              </h2>
              <p className="text-[0.95rem] leading-relaxed text-ld-text-secondary mb-4">
                {featured.summary}
              </p>
              <span className="inline-flex items-center gap-1 text-[0.9rem] text-ld-accent group-hover:gap-2 transition-all">
                Read article <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          )}

          {/* Rest of the listing — grid of cards */}
          {rest.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((item) => (
                <Link
                  key={item.slug}
                  href={`/articles/${item.slug}`}
                  className="group flex flex-col rounded-2xl border border-ld-border bg-ld-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-ld-accent/30 hover:bg-ld-card-hover hover:shadow-[0_18px_44px_rgba(0,0,0,0.28)]"
                >
                  <div className="flex items-center gap-2 mb-3 text-[0.72rem]">
                    {item.category && (
                      <span className="font-mono uppercase tracking-wider text-ld-text-muted">
                        {item.category}
                      </span>
                    )}
                    {item.publishedAt && (
                      <span className="inline-flex items-center gap-1 text-ld-text-muted">
                        <Calendar className="h-3 w-3" />
                        {fmtDate(item.publishedAt)}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold leading-tight mb-2 group-hover:text-ld-accent transition-colors line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="text-[0.88rem] leading-relaxed text-ld-text-secondary line-clamp-3 flex-1">
                    {item.summary}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[0.85rem] text-ld-accent group-hover:gap-2 transition-all">
                    Read <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Sign-up CTA */}
      <section className="mt-16 rounded-2xl border border-ld-accent/30 bg-ld-accent/[0.06] p-8 text-center">
        <h2 className="text-xl font-bold mb-2">Get the digest by email</h2>
        <p className="text-ld-text-secondary mb-5 max-w-[520px] mx-auto">
          Free Beacontry accounts can opt into the daily market digest by email — same
          content, delivered to your inbox the moment it publishes.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-[10px] bg-ld-accent px-6 py-3 text-[0.94rem] font-semibold text-white hover:-translate-y-0.5 hover:bg-ld-accent-dim transition-all"
        >
          Sign up free
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </PublicShell>
  );
}
