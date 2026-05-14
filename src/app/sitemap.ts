// Auto-generated sitemap for beacontry.com.
//
// Next.js 15 picks this up from src/app/sitemap.ts and serves it
// at /sitemap.xml. Includes:
//   - All static public routes
//   - One entry per guide (/learn/guides/<slug>)
//   - One entry per calculator (/tools/<slug>)
//   - Glossary single page (95 terms grouped by category — search
//     engines index it as one document)
//
// Articles + Congress trades pages NOT yet listed — those routes
// will be added when their public pages land in this batch.
//
// Run via `next build` (Next regenerates the sitemap each build).
// No DB calls — pure TS data sources, so it's deterministic +
// safe to inline in the build pipeline.

import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/education/guides-data";

const SITE = "https://beacontry.com";

// Slugs for /tools/[slug] — kept in sync with src/app/tools/[slug]/page.tsx.
// If a calculator is added there, add the slug here too. (Both files
// hand-curated lists; could be deduped to a shared module later.)
const CALCULATOR_SLUGS = [
  "compound-interest",
  "fire-number",
  "roth-vs-traditional",
  "employer-match",
  "quarterly-tax-estimator",
  "tax-loss-harvesting",
  "college-funding",
  "term-vs-whole-life",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static top-level public routes — priority hints based on a quick
  // gut check of importance. Search engines treat these as suggestions,
  // not directives.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/learn`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/glossary`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/tools`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/congress`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/articles`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/risk`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
  ];

  // One sitemap entry per guide. Use the guide's lastReviewed as the
  // lastModified hint so search engines re-crawl when content changes.
  const guideRoutes: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${SITE}/learn/guides/${g.slug}`,
    lastModified: new Date(g.lastReviewed),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // One per calculator.
  const calcRoutes: MetadataRoute.Sitemap = CALCULATOR_SLUGS.map((slug) => ({
    url: `${SITE}/tools/${slug}`,
    lastModified: now,
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...guideRoutes, ...calcRoutes];
}
