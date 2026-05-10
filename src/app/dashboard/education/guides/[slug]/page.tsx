import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";
import { GuideProgressTracker } from "@/components/education/guide-progress-tracker";
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
  if (!guide) return { title: "Guide not found" };
  return {
    title: `${guide.title} — Sentinel`,
    description: guide.summary,
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/dashboard/education/guides"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Guides
      </Link>

      {/* Header */}
      <header className="space-y-3 max-w-3xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="accent">{TOPIC_META[guide.topic].label}</Badge>
            <Badge variant={DIFFICULTY_VARIANT[guide.difficulty]}>
              {guide.difficulty}
            </Badge>
            <span className="text-xs text-text-muted flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {guide.readingMinutes} min read
            </span>
            <span className="text-xs text-text-muted">
              Updated {guide.lastReviewed}
            </span>
          </div>
          <GuideProgressTracker slug={guide.slug} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary">
          {guide.title}
        </h1>
        <p className="text-base leading-relaxed text-text-secondary">
          {guide.summary}
        </p>
      </header>

      <EducationalDisclaimer />

      {/* Body — TOC sidebar on lg+, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-8">
        <div className="min-w-0 max-w-3xl">
          <GuideRenderer guide={guide} />
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <GuideTableOfContents guide={guide} />
          </div>
        </aside>
      </div>

      {/* Footer disclaimer (full) */}
      <div className="pt-4 border-t border-border max-w-3xl">
        <EducationalDisclaimer />
      </div>
    </div>
  );
}
