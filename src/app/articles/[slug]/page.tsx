// /articles/[slug] — public article reader.
//
// Server-rendered. Looks up the article by slug; only renders if it's
// free (price = 0) and published. Paid articles return 404 here — the
// purchase flow lives at /dashboard/articles/[slug].
//
// Article bodies are stored as Markdown. We render with a lightweight
// CSS-class-based approach (no react-markdown dep on the public bundle)
// — the daily digest content is structurally simple: headings,
// paragraphs, lists, links. If editorial content grows in complexity
// we can swap in a real renderer later without breaking URLs.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
import { withTimeout } from "@/lib/db";
import { articles } from "@/lib/db/schema/content";
import { and, eq, isNotNull, lte } from "drizzle-orm";

const SLUG_RE = /^[a-z0-9][a-z0-9\-]{0,200}$/;

// Slug-based lookup. Returns null on miss OR on a non-free / unpublished
// article (consistent 404 surface — don't leak the existence of paid
// articles by 403'ing).
async function loadArticle(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  try {
    const rows = await withTimeout(5000, async (tx) => {
      return tx
        .select({
          title: articles.title,
          slug: articles.slug,
          category: articles.category,
          publishedAt: articles.publishedAt,
          body: articles.body,
          price: articles.price,
        })
        .from(articles)
        .where(
          and(
            eq(articles.slug, slug),
            eq(articles.price, 0),
            isNotNull(articles.publishedAt),
            lte(articles.publishedAt, new Date())
          )
        )
        .limit(1);
    });
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Minimal markdown → HTML. Handles the structures the auto-digest cron
// actually emits (h1-h3 headings, paragraphs, bullet lists, inline
// links, bold/italic). Output is rendered with `dangerouslySetInnerHTML`,
// so all interpolations go through `escapeHtml()` first.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  // Bold + italic + code (do in safe order — boldest first so the
  // outer * doesn't get eaten by italic regex).
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__(.+?)__/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/_(.+?)_/g, "<em>$1</em>");
  out = out.replace(/`([^`]+?)`/g, "<code>$1</code>");
  // Links: only http(s) targets. Other schemes drop through as plain text.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_m, text, href) =>
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
  );
  return out;
}

function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let inPara: string[] = [];

  const flushPara = () => {
    if (inPara.length === 0) return;
    out.push(`<p>${renderInline(inPara.join(" "))}</p>`);
    inPara = [];
  };

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      closeList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${renderInline(h[2])}</h${lvl}>`);
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${renderInline(li[1])}</li>`);
      continue;
    }
    closeList();
    inPara.push(line);
  }
  flushPara();
  closeList();
  return out.join("\n");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) return { title: "Article not found — Beacontry" };

  // Description: first ~160 chars of plain-text body (stripping markdown
  // chars). Search-engine description ceiling is ~155-160 chars.
  const firstPara = article.body.split(/\n\s*\n/)[0] ?? "";
  const plain = firstPara
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const description = plain.length > 160 ? plain.slice(0, 157) + "…" : plain;
  const url = `https://beacontry.com/articles/${slug}`;

  return {
    title: `${article.title} — Beacontry`,
    description,
    openGraph: {
      title: article.title,
      description,
      url,
      siteName: "Beacontry",
      type: "article",
      publishedTime: article.publishedAt
        ? new Date(article.publishedAt).toISOString()
        : undefined,
    },
    alternates: { canonical: url },
  };
}

export default async function PublicArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();

  const html = renderMarkdown(article.body);

  return (
    <PublicShell active="articles">
      <Link
        href="/articles"
        className="inline-flex items-center gap-1.5 text-sm text-ld-text-muted hover:text-ld-accent transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        All articles
      </Link>

      <article className="max-w-3xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-4 text-[0.78rem] text-ld-text-muted">
            {article.category && (
              <span className="inline-flex items-center gap-1 font-mono uppercase tracking-wider">
                <Tag className="h-3 w-3" />
                {article.category}
              </span>
            )}
            {article.publishedAt && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmtDate(article.publishedAt)}
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-ld-text leading-tight">
            {article.title}
          </h1>
        </header>

        {/* The prose section. Tailwind v4 doesn't bundle @tailwindcss/typography
            by default in this project, so we apply spacing + color rules
            scoped via CSS classes on the wrapping div. */}
        <div
          className="article-prose text-[1.04rem] leading-[1.78] text-ld-text-secondary"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <style>{`
          .article-prose h1 { font-size: 1.75rem; font-weight: 700; color: var(--color-ld-text, #fff); margin: 2rem 0 1rem; line-height: 1.25; }
          .article-prose h2 { font-size: 1.4rem; font-weight: 700; color: var(--color-ld-text, #fff); margin: 1.75rem 0 0.85rem; line-height: 1.3; }
          .article-prose h3 { font-size: 1.15rem; font-weight: 600; color: var(--color-ld-text, #fff); margin: 1.5rem 0 0.65rem; line-height: 1.4; }
          .article-prose p { margin: 0 0 1.1rem; }
          .article-prose ul { margin: 0 0 1.1rem 1.4rem; list-style-type: disc; }
          .article-prose li { margin-bottom: 0.35rem; }
          .article-prose a { color: var(--color-ld-accent, #10b981); text-decoration: underline; text-underline-offset: 2px; }
          .article-prose a:hover { color: var(--color-ld-accent-dim, #059669); }
          .article-prose strong { color: var(--color-ld-text, #fff); font-weight: 600; }
          .article-prose code { background: rgba(255,255,255,0.06); padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.92em; font-family: var(--font-mono, monospace); }
        `}</style>
      </article>

      {/* Sign-up CTA */}
      <section className="mt-12 max-w-3xl mx-auto rounded-2xl border border-ld-accent/30 bg-ld-accent/[0.06] p-8 text-center">
        <h2 className="text-xl font-bold mb-2">Track these stocks live</h2>
        <p className="text-ld-text-secondary mb-5 max-w-[520px] mx-auto">
          Sign up free to add the symbols in this article to your watchlist, see live
          Beacontry signals, and run backtests against them.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-[10px] bg-ld-accent px-6 py-3 text-[0.94rem] font-semibold text-white hover:-translate-y-0.5 hover:bg-ld-accent-dim transition-all"
        >
          Sign up free
        </Link>
      </section>
    </PublicShell>
  );
}
