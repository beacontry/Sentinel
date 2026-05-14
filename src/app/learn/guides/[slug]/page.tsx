// /learn/guides/[slug] — public guide reader. Mirrors the
// /dashboard/education/guides/[slug] structure but without the
// auth-required progress tracker. Anonymous visitors get the full
// guide content; the "save progress / take quiz" affordances are
// replaced with a "Sign up free" CTA.
//
// Pre-rendered at build time via generateStaticParams — every guide
// becomes a static HTML page, perfect for SEO.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
import { Badge } from "@/components/ui/badge";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";
import { PrintButton } from "@/components/education/print-button";
import {
  GuideRenderer,
  GuideTableOfContents,
} from "@/components/education/guide-renderer";
import {
  GUIDES,
  TOPIC_META,
  getGuideBySlug,
  type GuideDifficulty,
} from "@/lib/education/guides-data";

const DIFFICULTY_VARIANT: Record<
  GuideDifficulty,
  "default" | "bullish" | "warning" | "bearish"
> = {
  intro: "bullish",
  intermediate: "warning",
  advanced: "bearish",
};

/** Pre-render every guide at build time for SEO. */
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) return { title: "Guide not found — Beacontry" };

  const description = guide.summary.slice(0, 160);
  const url = `https://beacontry.com/learn/guides/${slug}`;

  return {
    title: `${guide.title} — Beacontry`,
    description,
    openGraph: {
      title: guide.title,
      description,
      type: "article",
      url,
      siteName: "Beacontry",
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function PublicGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  return (
    <PublicShell active="learn">
      {/* Breadcrumb */}
      <Link
        href="/learn"
        className="inline-flex items-center gap-1.5 text-sm text-ld-text-muted hover:text-ld-accent transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to all guides
      </Link>

      {/* Header */}
      <header className="space-y-3 max-w-3xl mb-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="accent">{TOPIC_META[guide.topic].label}</Badge>
            <Badge variant={DIFFICULTY_VARIANT[guide.difficulty]}>
              {guide.difficulty}
            </Badge>
            <span className="text-xs text-ld-text-muted flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {guide.readingMinutes} min read
            </span>
            <span className="text-xs text-ld-text-muted">
              Updated {guide.lastReviewed}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton />
          </div>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ld-text">
          {guide.title}
        </h1>
        <p className="text-base leading-relaxed text-ld-text-secondary">
          {guide.summary}
        </p>
      </header>

      <EducationalDisclaimer />

      {/* Body — same layout as the dashboard variant, just rendered
          inside PublicShell instead of AppShell. The GuideRenderer
          component is layout-agnostic. */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-8">
        <div className="min-w-0 max-w-3xl space-y-8">
          <GuideRenderer guide={guide} />
          {/* Quiz omitted on the public route — quiz state requires a
              user account. The CTA below points anonymous visitors
              to sign up for the full interactive experience. */}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <GuideTableOfContents guide={guide} />
          </div>
        </aside>
      </div>

      {/* Sign-up CTA */}
      <section className="mt-12 rounded-2xl border border-ld-accent/30 bg-ld-accent/[0.06] p-8 text-center max-w-3xl">
        <h2 className="text-xl font-bold mb-2">Save your progress + take the quiz</h2>
        <p className="text-ld-text-secondary mb-5 max-w-[520px] mx-auto">
          Sign up free to bookmark guides, take quizzes to test what you learned,
          and use spaced repetition so you actually remember.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-[10px] bg-ld-accent px-6 py-3 text-[0.94rem] font-semibold text-white hover:-translate-y-0.5 hover:bg-ld-accent-dim hover:shadow-[0_10px_34px_rgba(16,185,129,0.16)] transition-all"
        >
          Sign up free
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Footer disclaimer (full) */}
      <div className="pt-8 border-t border-ld-border max-w-3xl mt-8">
        <EducationalDisclaimer />
      </div>
    </PublicShell>
  );
}
