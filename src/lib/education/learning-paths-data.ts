/**
 * Learning paths — curated, ordered sequences of guides that walk a user
 * through a topic end-to-end. Inspired by Warrior Trading's curriculum
 * structure (Day Trading, Small Cap, Large Cap, Options) but built on top
 * of Sentinel's existing guide system rather than as a separate content
 * silo.
 *
 * A path is just metadata + an ordered list of guide slugs — content lives
 * in guides-data.ts. Progress is derived from existing education_guide_views
 * via useEducationProgress; no new DB schema required.
 *
 * Adding a path: append a const here and to the PATHS array. The UI auto-
 * renders any path with at least one referenced guide; broken slugs surface
 * via getPathReadingMinutes() returning 0 for the missing guide.
 */

import { GUIDES } from "./guides-data";

export type PathDifficulty = "beginner" | "intermediate" | "advanced";

export interface LearningPath {
  slug: string;
  title: string;
  /** One-sentence pitch shown on the path card. */
  tagline: string;
  /** Longer description shown on the path detail page. */
  description: string;
  /** Lucide icon name. */
  icon: string;
  difficulty: PathDifficulty;
  /** Ordered guide slugs — order is the suggested reading order. */
  guideSlugs: string[];
  /** Other path slugs recommended before starting this one. */
  prerequisites?: string[];
}

// ── Paths ──────────────────────────────────────────────────────────

const traderTaxFoundations: LearningPath = {
  slug: "trader-tax-foundations",
  title: "Trader Tax Foundations",
  tagline:
    "The three IRS rules every active trader needs to understand before placing their first hundred trades.",
  description:
    "Active trading creates tax situations a buy-and-hold investor never sees: wash sales eating realized losses, the §475(f) mark-to-market election, and the quarterly estimated payments the IRS expects when withholding doesn't cover the bill. This path walks the rules in the order they matter — what's optional, what's automatic, and what you owe.",
  icon: "Receipt",
  difficulty: "intermediate",
  guideSlugs: [
    "wash-sale-rules-deep-dive",
    "trader-tax-status-and-mtm-election",
    "quarterly-estimated-taxes-for-traders",
  ],
};

const retirementOrderOfOperations: LearningPath = {
  slug: "retirement-order-of-operations",
  title: "Retirement: Order of Operations",
  tagline:
    "Where does your next dollar go? Match → HSA → Roth → 401(k) → backdoor, and why that order matters.",
  description:
    "Most retirement advice is fragmented: 'use a Roth,' 'max your 401(k),' 'don't forget the HSA.' The interesting question is the order — given a fixed amount you can save this month, which account does the next dollar go into? This path teaches the order, then deep-dives the accounts in the sequence they show up.",
  icon: "PiggyBank",
  difficulty: "beginner",
  guideSlugs: [
    "order-of-operations-where-to-put-your-next-dollar",
    "roth-ira-deep-dive",
    "hsa-stealth-retirement",
    "backdoor-and-mega-backdoor-roth",
    "asset-location-strategy",
  ],
};

const smallCapMomentumBasics: LearningPath = {
  slug: "small-cap-momentum-basics",
  title: "Small-Cap Momentum Basics",
  tagline:
    "The Warrior-style playbook: gappers, bull flags, risk-per-trade sizing. Companion to Sentinel's momentum engine mode.",
  description:
    "Small-cap momentum is its own discipline: 1-minute charts, low-float stocks gapping on news, tight bull-flag breakouts with volume confirmation, risk-per-trade sizing, halt-resume reads, and a hard mid-day stop. This path is the conceptual companion to the gapper scanner and momentum analyzer that power the engine's momentum mode. Start here before enabling momentum mode in the engine.",
  icon: "Zap",
  difficulty: "intermediate",
  guideSlugs: [
    "anatomy-of-a-gapper",
    "bull-flag-breakout",
    "risk-per-trade-sizing",
    "halts-and-resumes",
    "eleven-thirty-cutoff",
  ],
  prerequisites: ["trader-tax-foundations"],
};

// ── Registry ───────────────────────────────────────────────────────

export const PATHS: LearningPath[] = [
  retirementOrderOfOperations,
  traderTaxFoundations,
  smallCapMomentumBasics,
];

// ── Helpers ────────────────────────────────────────────────────────

export function getPathBySlug(slug: string): LearningPath | undefined {
  return PATHS.find((p) => p.slug === slug);
}

/** Paths containing a given guide, in PATHS order. Used for cross-linking. */
export function getPathsForGuide(guideSlug: string): LearningPath[] {
  return PATHS.filter((p) => p.guideSlugs.includes(guideSlug));
}

/** Sum of reading minutes across a path's guides. Unknown slugs contribute 0. */
export function getPathReadingMinutes(path: LearningPath): number {
  let total = 0;
  for (const slug of path.guideSlugs) {
    const g = GUIDES.find((x) => x.slug === slug);
    if (g) total += g.readingMinutes;
  }
  return total;
}

/** Progress state for the rendering layer. */
export interface PathProgress {
  total: number;
  viewed: number;
  quizPassed: number;
  /** Fraction 0..1, weighted: viewed = 0.5, quizPassed = 1.0. */
  fraction: number;
  /** Slug of the next un-viewed guide in the path, or null if complete. */
  nextSlug: string | null;
}

interface ProgressLike {
  viewed?: boolean;
  quizPassed?: boolean;
}

/**
 * Derive path progress from per-guide progress. Caller passes whatever shape
 * their progress hook returns and we read the boolean state.
 *
 * Weighted because "viewed" and "quizPassed" mean different things — reading
 * a guide is progress; passing the quiz is mastery. A path where every
 * guide is viewed but no quizzes are passed is 50% complete, not 100%.
 */
export function getPathProgress(
  path: LearningPath,
  progressBySlug: Map<string, ProgressLike>
): PathProgress {
  const total = path.guideSlugs.length;
  let viewed = 0;
  let quizPassed = 0;
  let nextSlug: string | null = null;
  for (const slug of path.guideSlugs) {
    const p = progressBySlug.get(slug);
    if (p?.quizPassed) {
      quizPassed++;
      viewed++;
    } else if (p?.viewed) {
      viewed++;
      if (nextSlug === null) nextSlug = slug;
    } else if (nextSlug === null) {
      nextSlug = slug;
    }
  }
  const fraction = total === 0 ? 0 : (viewed * 0.5 + quizPassed * 0.5) / total;
  return { total, viewed, quizPassed, fraction, nextSlug };
}
