/**
 * Personal-finance education guides.
 *
 * Educational only. Not financial, tax, or legal advice. Limits and rules
 * cited are current as of 2026 — verify before acting. The PermanentLife
 * guide intentionally takes an honest stance on cash-value insurance because
 * users deserve clarity on a heavily-marketed product class.
 */

import type { ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export type GuideTopic =
  | "retirement"
  | "education-funding"
  | "insurance"
  | "tax"
  | "estate";

export type GuideDifficulty = "intro" | "intermediate" | "advanced";

export type CalloutTone = "info" | "warning" | "tip" | "danger";

export interface GuideCallout {
  type: "callout";
  tone: CalloutTone;
  title?: string;
  body: string;
}

export interface GuideTable {
  type: "table";
  caption?: string;
  headers: string[];
  rows: string[][];
  /** Optional per-column alignment, defaults to "left" */
  align?: ("left" | "right" | "center")[];
}

export interface GuideList {
  type: "list";
  ordered?: boolean;
  items: string[];
}

export interface GuideParagraph {
  type: "paragraph";
  text: string;
}

export interface GuideHeading {
  type: "heading";
  /** h3 or h4 within a section */
  level: 3 | 4;
  text: string;
}

export interface GuideKeyValue {
  type: "key-value";
  caption?: string;
  pairs: { label: string; value: string }[];
}

/** Embedded interactive calculator slot — rendered by GuideRenderer */
export interface GuideCalculator {
  type: "calculator";
  calculator:
    | "roth-vs-traditional"
    | "college-funding-compare"
    | "term-vs-whole-life"
    | "tax-loss-harvesting"
    | "employer-match-optimizer"
    | "compound-interest"
    | "fire-number"
    | "quarterly-tax-estimator";
  caption?: string;
}

export type GuideBlock =
  | GuideParagraph
  | GuideHeading
  | GuideList
  | GuideTable
  | GuideCallout
  | GuideKeyValue
  | GuideCalculator;

export interface GuideSection {
  id: string;
  heading: string;
  blocks: GuideBlock[];
}

export interface QuizQuestion {
  /** The question prompt. */
  question: string;
  /** 4 options, exactly one correct. */
  options: [string, string, string, string];
  /** Index 0..3 of the correct option. */
  correctIndex: 0 | 1 | 2 | 3;
  /** Brief explanation shown after submit, regardless of correctness. */
  explanation: string;
}

export interface Guide {
  slug: string;
  title: string;
  topic: GuideTopic;
  difficulty: GuideDifficulty;
  /** One-sentence summary used on the index card */
  summary: string;
  /** Estimated reading time in minutes */
  readingMinutes: number;
  /** Last reviewed date (YYYY-MM-DD) for content currency */
  lastReviewed: string;
  /** Quick-reference key facts shown above the body */
  keyFacts: { label: string; value: string }[];
  sections: GuideSection[];
  /** Optional 5-question quiz; pass = >= 80% (4/5). */
  quiz?: QuizQuestion[];
}

// ─── Topic metadata ───────────────────────────────────────────────────────

export const TOPIC_META: Record<GuideTopic, { label: string; description: string }> = {
  retirement: {
    label: "Retirement",
    description: "IRAs, 401(k)s, HSAs, conversion strategies, and decumulation.",
  },
  "education-funding": {
    label: "Education Funding",
    description: "529 plans, ESAs, UTMA/UGMA, and using insurance for college.",
  },
  insurance: {
    label: "Insurance",
    description: "Term, whole life, IUL, VUL, and when each fits (or doesn't).",
  },
  tax: {
    label: "Tax Strategy",
    description: "Account stacking, asset location, harvesting, conversions.",
  },
  estate: {
    label: "Estate Planning",
    description: "Step-up basis, beneficiary designations, trusts, transfer.",
  },
};

// ─── Guides ───────────────────────────────────────────────────────────────

const rothIra: Guide = {
  slug: "roth-ira-deep-dive",
  title: "Roth IRA: A Deep Dive",
  topic: "retirement",
  difficulty: "intro",
  summary:
    "How the Roth IRA actually works, who should use one, the 5-year rules, and the most common mistakes.",
  readingMinutes: 9,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "2026 Contribution Limit", value: "$7,000 / $8,000 (50+)" },
    { label: "Income Phase-Out (Single)", value: "$150K–$165K MAGI" },
    { label: "Income Phase-Out (MFJ)", value: "$236K–$246K MAGI" },
    { label: "Tax Treatment", value: "After-tax in, tax-free out" },
    { label: "RMDs", value: "None during owner's life" },
    { label: "Withdrawal of Contributions", value: "Anytime, tax/penalty-free" },
  ],
  sections: [
    {
      id: "what-it-is",
      heading: "What a Roth IRA actually is",
      blocks: [
        {
          type: "paragraph",
          text: "A Roth IRA is an Individual Retirement Account funded with money you've already paid income tax on. In exchange for giving up the upfront deduction you'd get from a Traditional IRA, you get something more valuable for most people: every dollar that grows inside the account — and every dollar you withdraw in retirement — is tax-free. Forever.",
        },
        {
          type: "paragraph",
          text: "The Roth is arguably the single best account in the U.S. tax code for long-horizon investors with decades of compounding ahead. Forty years of tax-free growth on a maxed-out Roth is the difference between owing six figures of taxes and owing zero.",
        },
        {
          type: "callout",
          tone: "info",
          title: "Roth vs Traditional in one sentence",
          body: "Pay tax now (Roth) when your current bracket is lower than your expected retirement bracket; pay tax later (Traditional) when your current bracket is higher. Most younger / lower-income earners win with Roth.",
        },
      ],
    },
    {
      id: "limits",
      heading: "Contribution limits & income phase-outs (2026)",
      blocks: [
        {
          type: "table",
          headers: ["Filing Status", "Full Contribution", "Phase-Out", "No Contribution"],
          rows: [
            ["Single / HoH", "MAGI < $150,000", "$150K–$165K", "MAGI ≥ $165,000"],
            ["Married Filing Jointly", "MAGI < $236,000", "$236K–$246K", "MAGI ≥ $246,000"],
            ["Married Filing Separately", "MAGI = $0", "$0–$10,000", "MAGI ≥ $10,000"],
          ],
          align: ["left", "right", "right", "right"],
        },
        {
          type: "paragraph",
          text: "Annual limit is $7,000, or $8,000 if you're 50+. The contribution must be backed by 'earned income' — wages, self-employment, etc. Investment and rental income don't count. Spouses without earned income can use a Spousal IRA backed by the working spouse's earnings.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Above the income limit?",
          body: "Use the Backdoor Roth: contribute non-deductible to a Traditional IRA, then immediately convert. Watch the Pro-Rata Rule if you have other pre-tax IRA balances — see the glossary entry.",
        },
      ],
    },
    {
      id: "five-year-rule",
      heading: "The 5-year rules (there are two)",
      blocks: [
        {
          type: "paragraph",
          text: "The 5-year rule trips up smart people because there are actually two separate clocks running, and they apply to different things.",
        },
        {
          type: "heading",
          level: 4,
          text: "Clock #1: Tax-free earnings withdrawals",
        },
        {
          type: "paragraph",
          text: "To withdraw earnings tax-free, you must (a) be 59½ or older, AND (b) have had ANY Roth IRA open for at least 5 years. This clock starts the year of your first contribution and applies for life. Once it's started, opening more Roth IRAs doesn't reset it.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Open one with $1 today",
          body: "If you're young and not ready to fund a Roth, contribute even $1 just to start the clock. Twenty years from now you'll thank yourself.",
        },
        {
          type: "heading",
          level: 4,
          text: "Clock #2: Conversion principal withdrawals",
        },
        {
          type: "paragraph",
          text: "Each Roth conversion has its own 5-year clock before the converted dollars can be withdrawn penalty-free if you're under 59½. This is what makes the Roth Conversion Ladder work for early retirees: convert in 2026, withdraw that principal penalty-free in 2031.",
        },
      ],
    },
    {
      id: "withdrawals",
      heading: "Withdrawal hierarchy",
      blocks: [
        {
          type: "paragraph",
          text: "The IRS treats Roth withdrawals in a specific order, which makes early access more flexible than people realize:",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Direct contributions — anytime, no tax, no penalty.",
            "Conversions (oldest first) — tax-free always, penalty-free after the conversion's 5-year clock or age 59½.",
            "Earnings — tax-free only if 59½+ AND any Roth has been open 5+ years; otherwise taxable + 10% penalty unless an exception applies.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Don't be too clever",
          body: "Withdrawing contributions to fund a kitchen renovation works on paper but burns the most powerful long-term tax shelter you'll ever have. Treat the Roth as untouchable until retirement except in a real emergency.",
        },
      ],
    },
    {
      id: "who-should",
      heading: "Who should prioritize a Roth",
      blocks: [
        {
          type: "list",
          items: [
            "Anyone in their 20s/30s with 30+ years of compounding ahead.",
            "Anyone currently in the 12% or 22% federal bracket who expects higher taxes in retirement.",
            "High earners using the Backdoor or Mega Backdoor.",
            "Workers expecting big income in retirement (large pensions, rental income, Social Security at 70).",
            "Early retirees planning a Roth Conversion Ladder.",
            "Anyone who wants beneficiaries to inherit tax-free assets (Roth has no RMDs for the original owner).",
          ],
        },
      ],
    },
    {
      id: "calculator",
      heading: "Run the numbers",
      blocks: [
        {
          type: "paragraph",
          text: "The 'Roth vs Traditional' debate ultimately comes down to one variable: your tax bracket today versus your tax bracket in retirement. Use the calculator below to compare both paths with your own numbers.",
        },
        {
          type: "calculator",
          calculator: "roth-vs-traditional",
        },
      ],
    },
    {
      id: "mistakes",
      heading: "Common mistakes",
      blocks: [
        {
          type: "list",
          items: [
            "Forgetting earned-income requirement (gifts, dividends, rental don't qualify).",
            "Triggering the Pro-Rata Rule by attempting a Backdoor Roth with a pre-tax Rollover IRA balance.",
            "Withdrawing contributions for non-emergencies and losing decades of compounding.",
            "Treating the 5-year clock as if it resets per account (it starts from your FIRST Roth ever).",
            "Skipping Roth contributions in low-income years (gap year, sabbatical, first job) — these are the cheapest years to fund a Roth.",
            "Contributing while ineligible due to income — fix with a 'recharacterization' or 'corrective distribution' before tax filing.",
          ],
        },
      ],
    },
  ],
};

const hsaStealth: Guide = {
  slug: "hsa-stealth-retirement",
  title: "The HSA: A Stealth Retirement Account",
  topic: "retirement",
  difficulty: "intermediate",
  summary:
    "The only triple-tax-advantaged account in the U.S. tax code, and how to weaponize it for retirement instead of just medical bills.",
  readingMinutes: 8,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "2026 Contribution (Self)", value: "$4,400" },
    { label: "2026 Contribution (Family)", value: "$8,750" },
    { label: "Catch-Up (55+)", value: "+$1,000" },
    { label: "Tax Treatment", value: "Triple-advantaged" },
    { label: "Required", value: "HDHP coverage" },
    { label: "After 65", value: "Acts like Traditional IRA" },
  ],
  sections: [
    {
      id: "triple-advantage",
      heading: "The triple tax advantage",
      blocks: [
        {
          type: "paragraph",
          text: "An HSA is the only account in the U.S. tax code with three layers of tax savings stacked on top of each other:",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Contributions are tax-deductible (above-the-line, lowers AGI even without itemizing).",
            "Growth inside the account is tax-free — no taxes on dividends, interest, or capital gains.",
            "Withdrawals for qualified medical expenses are tax-free at any age.",
          ],
        },
        {
          type: "paragraph",
          text: "By comparison, a Roth IRA gets you 2 of 3 (no upfront deduction); a Traditional IRA gets you 2 of 3 (taxable on withdrawal); a regular brokerage gets you 0 of 3.",
        },
      ],
    },
    {
      id: "eligibility",
      heading: "Who's eligible",
      blocks: [
        {
          type: "paragraph",
          text: "To contribute to an HSA you must be enrolled in a qualifying High-Deductible Health Plan (HDHP) and have no other disqualifying coverage (general-purpose FSA, traditional health plan, Medicare, dependent on someone else's tax return).",
        },
        {
          type: "table",
          caption: "2026 HDHP requirements",
          headers: ["Coverage", "Min Deductible", "Max Out-of-Pocket"],
          rows: [
            ["Self-Only", "$1,700", "$8,500"],
            ["Family", "$3,400", "$17,000"],
          ],
          align: ["left", "right", "right"],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Don't pick HDHP just for the HSA",
          body: "If you have predictable high medical spending or a chronic condition, the lower premiums of an HDHP can be eaten by deductibles before you ever reach the HSA tax win. Run your expected annual medical spend against both plans first.",
        },
      ],
    },
    {
      id: "the-stealth-strategy",
      heading: "The stealth retirement strategy",
      blocks: [
        {
          type: "paragraph",
          text: "Most people use HSAs as a checking account for current medical bills. That's fine — but it leaves the real value on the table. The optimal play for high earners with cash flow is:",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Max the HSA every year ($4,400 / $8,750 in 2026, +$1,000 if 55+).",
            "Pay current medical bills out of pocket from your normal cash flow.",
            "Save every receipt and EOB — digitally, indefinitely.",
            "Invest the HSA aggressively — most providers let you buy ETFs once you hit a small cash threshold.",
            "Let it compound for 20–40 years.",
            "In retirement, reimburse yourself tax-free for the decades of accumulated receipts. Cash out the rest for medical or, after 65, anything (taxed as ordinary income — same as a Traditional IRA).",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Why receipts have no expiration",
          body: "There is no IRS deadline to reimburse yourself for a qualified medical expense, as long as the expense was incurred AFTER you opened the HSA AND not paid for or reimbursed by another source. A 2026 dental bill paid out of pocket can be reimbursed tax-free in 2056.",
        },
      ],
    },
    {
      id: "after-65",
      heading: "After age 65",
      blocks: [
        {
          type: "paragraph",
          text: "After 65 the 20% non-medical penalty disappears. You can use HSA dollars for anything — vacations, groceries, a new boat — and pay only ordinary income tax, identical to a Traditional IRA. So even if you never accumulate a single medical receipt, the HSA remains at worst as good as a Traditional IRA.",
        },
        {
          type: "paragraph",
          text: "Continuing to use it for medical expenses is still better, of course — Medicare premiums (Parts B and D), long-term care insurance premiums, and any qualified medical expenses are still 100% tax-free.",
        },
      ],
    },
    {
      id: "providers",
      heading: "Picking a provider",
      blocks: [
        {
          type: "paragraph",
          text: "Your employer's default HSA is often a high-fee, limited-fund-menu account. The good news: you can do an HSA-to-HSA transfer at any time, with no tax consequences and no limit on frequency, to any provider you want.",
        },
        {
          type: "table",
          headers: ["Provider", "Fees", "Investment Options", "Notes"],
          rows: [
            [
              "Fidelity HSA",
              "$0",
              "Full brokerage (stocks, ETFs, mutual funds)",
              "Most flexible, no minimum to invest.",
            ],
            [
              "Lively",
              "$0 (individual)",
              "Schwab brokerage integration",
              "Slick UI, individual stocks supported.",
            ],
            [
              "HealthEquity",
              "Monthly fee varies",
              "Limited mutual fund menu",
              "Often the employer default; consider transferring to Fidelity.",
            ],
            [
              "HSA Bank",
              "Tiered",
              "Schwab brokerage option",
              "Common employer plan.",
            ],
          ],
        },
      ],
    },
    {
      id: "pitfalls",
      heading: "Pitfalls",
      blocks: [
        {
          type: "list",
          items: [
            "Spouse's general-purpose FSA disqualifies you from HSA contributions — switch to a Limited-Purpose FSA (dental/vision only).",
            "Enrolling in any part of Medicare (including Part A) ends HSA eligibility — coordinate Social Security/Medicare timing carefully.",
            "Non-qualified withdrawal under 65: full income tax + 20% penalty (worse than a Traditional IRA's 10%).",
            "Excess contributions: 6% annual penalty until corrected — withdraw excess + earnings before tax filing.",
            "Lost receipts = lost reimbursement headroom. Build a digital habit (folder per year, photos of paper receipts).",
          ],
        },
      ],
    },
  ],
};

const fivetwonine: Guide = {
  slug: "529-plans-explained",
  title: "529 Plans: How to Fund College Tax-Free",
  topic: "education-funding",
  difficulty: "intro",
  summary:
    "How 529s actually work, the state-tax angle, what counts as a qualified expense, and the SECURE 2.0 Roth rollover.",
  readingMinutes: 10,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Federal Contribution Limit", value: "Lifetime — varies by state ($235K–$575K)" },
    { label: "Annual Gift Tax Exclusion", value: "$19,000 / contributor (2026)" },
    { label: "5-Year Superfund", value: "Up to $95,000 lump sum" },
    { label: "Federal Tax", value: "Tax-free growth + qualified withdrawals" },
    { label: "K-12 Tuition", value: "Up to $10K/yr qualified" },
    { label: "Roth Rollover", value: "Up to $35K lifetime (15-yr rule)" },
  ],
  sections: [
    {
      id: "what-it-is",
      heading: "What a 529 actually is",
      blocks: [
        {
          type: "paragraph",
          text: "A 529 plan is a state-sponsored, tax-advantaged investment account designed for education expenses. You contribute after-tax dollars (federally — many states give you a deduction), the money grows tax-free, and qualified withdrawals are tax-free as well.",
        },
        {
          type: "paragraph",
          text: "There are two flavors: education savings plans (the standard, invested in mutual funds) and prepaid tuition plans (lock in today's tuition rates at participating schools — much rarer, with strict residency requirements). Almost everything below refers to the standard savings plan.",
        },
      ],
    },
    {
      id: "state-tax-angle",
      heading: "The state tax deduction angle",
      blocks: [
        {
          type: "paragraph",
          text: "About 30 states give you a state income tax deduction or credit for 529 contributions — sometimes only if you use your home state's plan, sometimes with any state's plan ('tax parity' states). This is often the deciding factor in plan selection.",
        },
        {
          type: "table",
          caption: "Three patterns of state tax treatment",
          headers: ["Pattern", "Examples", "Strategy"],
          rows: [
            [
              "Home-state only deduction",
              "NY, MA, IL, OR, RI",
              "Use your home state's plan unless funds are too poor — the deduction usually beats the fund-quality difference.",
            ],
            [
              "Tax parity (any state qualifies)",
              "AZ, KS, MN, MO, MT, PA",
              "Pick the best plan in the country (Utah, Nevada, NY, Illinois are top-tier).",
            ],
            [
              "No state deduction (or no state income tax)",
              "FL, TX, WA, CA, NJ",
              "Pick the best plan nationally — no reason to default to home state.",
            ],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Top non-home-state plans",
          body: "Utah's my529, Nevada's Vanguard 529, New York's 529 Direct, and Illinois Bright Start are consistently ranked highest for low fees and Vanguard/index-fund availability.",
        },
      ],
    },
    {
      id: "qualified",
      heading: "What counts as a qualified expense",
      blocks: [
        {
          type: "list",
          items: [
            "Tuition and required fees at any accredited college, university, vocational/trade school, or graduate program.",
            "Room and board, capped at the school's published 'cost of attendance' figure (or actual housing cost for off-campus).",
            "Required books, supplies, and equipment.",
            "Computers, peripherals, software, and internet access used primarily by the beneficiary.",
            "Special needs services for special-needs beneficiaries.",
            "K-12 tuition, up to $10,000 per beneficiary per year.",
            "Apprenticeship program costs (registered with the Dept. of Labor).",
            "Student loan repayments, up to $10,000 lifetime per beneficiary (and another $10K for each sibling).",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Non-qualified withdrawals",
          body: "Earnings on non-qualified withdrawals are taxed as ordinary income + 10% federal penalty. Contributions (basis) come back tax-free regardless. The penalty is waived for scholarships received, beneficiary disability/death, or attending a service academy — but ordinary tax on earnings still applies.",
        },
      ],
    },
    {
      id: "secure-2-roth",
      heading: "The SECURE 2.0 Roth rollover (huge)",
      blocks: [
        {
          type: "paragraph",
          text: "Starting 2024, unused 529 funds can be rolled into a Roth IRA for the beneficiary. This was a major change — it eliminated one of the biggest objections to 529s ('what if my kid doesn't go to college').",
        },
        {
          type: "key-value",
          caption: "Rules of the 529-to-Roth rollover",
          pairs: [
            { label: "Lifetime cap", value: "$35,000 per beneficiary" },
            { label: "529 must be open", value: "15+ years" },
            { label: "Annual limit", value: "Subject to annual Roth IRA limit ($7K in 2026)" },
            { label: "Earned income", value: "Beneficiary needs earned income equal to the rollover amount" },
            { label: "Account age limit", value: "Contributions/earnings from last 5 years aren't eligible" },
            { label: "Beneficiary", value: "Roth IRA must be in the 529 beneficiary's name" },
          ],
        },
        {
          type: "paragraph",
          text: "Practical implication: if you start a 529 when your kid is born, by the time they're 15 they could roll up to $35K into a Roth IRA over multiple years — even if they never spend a dime on college. That Roth, compounded for 50 years at 8%, is worth ~$1.6M tax-free.",
        },
      ],
    },
    {
      id: "beneficiary-flex",
      heading: "Beneficiary flexibility",
      blocks: [
        {
          type: "paragraph",
          text: "The 529 owner (usually a parent) can change the beneficiary at any time, with no tax consequences, to any 'member of the family' of the original beneficiary. The IRS definition is broad: siblings, parents, aunts/uncles, nieces/nephews, in-laws, even cousins. You can also name yourself.",
        },
        {
          type: "paragraph",
          text: "This makes overfunding less risky — leftover dollars can shift to another child, a future grandchild, or even back to the parent for a late-career graduate degree.",
        },
      ],
    },
    {
      id: "compare",
      heading: "529 vs Roth IRA vs UTMA vs taxable",
      blocks: [
        {
          type: "calculator",
          calculator: "college-funding-compare",
          caption: "Compare projected after-tax balances across vehicles",
        },
        {
          type: "table",
          headers: ["Vehicle", "Tax Treatment", "Flexibility", "Financial Aid Hit"],
          rows: [
            [
              "529",
              "Tax-free if qualified",
              "Beneficiary changeable; $35K Roth rollover after 15 yrs",
              "Parent asset: ~5.6%",
            ],
            [
              "Roth IRA (parent's)",
              "Tax-free in retirement; can use principal earlier",
              "Highest — but every dollar used for college is one fewer for retirement",
              "Not reported on FAFSA",
            ],
            [
              "Coverdell ESA",
              "Like 529 but $2K/yr cap, income limits",
              "More investment options",
              "Parent asset: ~5.6%",
            ],
            [
              "UTMA / UGMA",
              "Kiddie tax above ~$2.7K",
              "Becomes child's property at age of majority",
              "Student asset: ~20%",
            ],
            [
              "Taxable brokerage",
              "Capital gains taxed normally",
              "Total flexibility",
              "Parent asset: ~5.6%",
            ],
          ],
        },
      ],
    },
    {
      id: "pitfalls",
      heading: "Pitfalls",
      blocks: [
        {
          type: "list",
          items: [
            "Overfunding without a plan B — start with conservative growth assumptions; you can always front-load later.",
            "Using K-12 distributions in states where the deduction is recaptured for non-college use.",
            "Aggressive equity allocation when the kid is 17 — glide path matters; many plans offer age-based portfolios.",
            "Forgetting state tax recapture if you change plans (some states claw back deductions).",
            "Coordinating with American Opportunity Tax Credit — you can't double-dip the same expenses.",
          ],
        },
      ],
    },
  ],
};

const permanentLife: Guide = {
  slug: "permanent-life-insurance-honest-look",
  title: "Permanent Life Insurance: An Honest Look",
  topic: "insurance",
  difficulty: "advanced",
  summary:
    "Whole life, IUL, VUL, policy loans, and the 'use it for college' pitch — what works, what's marketing, and when these products actually fit.",
  readingMinutes: 14,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Term Life Cost", value: "5–15× cheaper than permanent" },
    { label: "Whole Life IRR (typical)", value: "2–4% over 20+ years" },
    { label: "IUL Cap", value: "Often 8–12% (insurer-adjustable)" },
    { label: "Cash Value Year 1", value: "Often $0–20% of premium" },
    { label: "Surrender Charge Period", value: "Typically 10–15 years" },
    { label: "Sales Commission", value: "50–110% of first-year premium" },
  ],
  sections: [
    {
      id: "premise",
      heading: "The premise — and the pitch",
      blocks: [
        {
          type: "paragraph",
          text: "Permanent life insurance combines a death benefit (like term insurance) with a 'cash value' savings or investment component. The pitch usually includes some combination of: tax-free growth, tax-free retirement income via policy loans, college funding without affecting financial aid, infinite banking, market gains without market losses, and a death benefit you can't outlive.",
        },
        {
          type: "paragraph",
          text: "Most of these claims are technically accurate. The question is whether they're a better deal than the alternatives. For the vast majority of buyers, they're not — but there are real edge cases where permanent insurance is the right answer. Let's separate them honestly.",
        },
        {
          type: "callout",
          tone: "danger",
          title: "Conflict of interest is the entire industry",
          body: "Whole life pays the agent 50–110% of your first year's premium as commission. IUL pays similar. Term pays maybe 30%. This is why permanent insurance gets pushed harder than term — not because it's better for you. Always ask for the agent's commission disclosure, in writing, before signing.",
        },
      ],
    },
    {
      id: "term-vs-permanent",
      heading: "Term vs Permanent: the structural difference",
      blocks: [
        {
          type: "table",
          headers: ["", "Term", "Whole Life", "IUL"],
          rows: [
            [
              "Death benefit",
              "Yes, fixed term (10/20/30 yr)",
              "Yes, lifetime",
              "Yes, lifetime (if funded)",
            ],
            [
              "Cash value",
              "None",
              "Guaranteed schedule",
              "Index-linked, capped",
            ],
            [
              "Cost (35yo, $1M)",
              "~$25/mo",
              "~$700+/mo",
              "Variable, $400+/mo",
            ],
            ["Premiums", "Fixed", "Fixed", "Flexible"],
            [
              "Commission to agent",
              "Modest",
              "Very high",
              "Very high",
            ],
            ["Surrender charge?", "No", "Yes (10–15 yrs)", "Yes (10–15 yrs)"],
          ],
        },
        {
          type: "paragraph",
          text: "The cost spread above is not a typo. The same person pays 28× more for whole life than 20-year term. The math behind the spread is largely: insurance cost (small) + commissions (large in early years) + insurer overhead + insurer profit + a slow-build cash value. The cash value is real, but it's funded by the spread between what you pay and what term would cost.",
        },
      ],
    },
    {
      id: "cash-value-truth",
      heading: "How cash value actually grows",
      blocks: [
        {
          type: "paragraph",
          text: "In a typical whole life policy, the first 1–3 years of premiums build essentially zero cash value — the bulk goes to commissions and policy expenses. By year 5, cash value is typically still less than total premiums paid. By year 10–12, you may break even on premiums-in vs cash-value-out. From there, the policy grows at the insurer's declared dividend or interest rate (currently 4–6% gross, but the net IRR after policy charges is typically 2–4%).",
        },
        {
          type: "paragraph",
          text: "IUL is structurally similar but the cash value is credited based on a stock index with a floor (often 0%) and a cap (often 8–12%). Two important details the illustrations don't emphasize:",
        },
        {
          type: "list",
          items: [
            "The cap can be lowered by the insurer at any time. Caps that started at 12% in 2010 are 6–8% in many policies today.",
            "The index credit excludes dividends. The S&P 500's long-term ~10% return includes ~2% from dividends — your IUL is benchmarking against the price-only ~8% before the cap is even applied.",
            "The 'no losses in down years' floor exists, but policy charges (mortality, admin) are deducted EVERY year regardless. A 0% credited year still loses money to fees.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Run illustrations at lower returns",
          body: "Sales illustrations frequently use 6–7% as the assumed crediting rate. That's optimistic. Re-run the same illustration at 4% or 5% and the projected retirement income often drops by 60%+. If the policy doesn't make sense at conservative rates, it doesn't make sense.",
        },
      ],
    },
    {
      id: "policy-loans",
      heading: "Policy loans (the college funding pitch)",
      blocks: [
        {
          type: "paragraph",
          text: "Once you have meaningful cash value, you can borrow against it. The insurer lends you money, charging 4–8% interest, while in many policies the underlying cash value continues to grow as if you hadn't borrowed. The borrowed money isn't taxable income, since it's a loan. That's the basis of the 'use whole life for college' pitch.",
        },
        {
          type: "paragraph",
          text: "How it actually plays out: you pay premiums for 17 years to build cash value. When the kid hits college, you borrow $50K/yr × 4 = $200K. The loan accrues interest. You either repay it (out of cash flow), let it compound (reducing the eventual death benefit), or let it ride. In the worst case — if the policy lapses with an outstanding loan — the loan amount above your cost basis becomes taxable income, often a large surprise tax bill.",
        },
        {
          type: "callout",
          tone: "info",
          title: "The honest comparison",
          body: "If you have 17 years to fund college, a 529 is dramatically more efficient: same tax-free growth, lower fees, no commission drag, no policy lapse risk, and now (post-SECURE 2.0) up to $35K can roll to a Roth if unused. The whole life route only wins if you separately need a large permanent death benefit (HNW estate planning) — in which case you're not really using it 'for college,' you're using it for estate liquidity that happens to be borrowable.",
        },
      ],
    },
    {
      id: "infinite-banking",
      heading: "The 'Infinite Banking Concept'",
      blocks: [
        {
          type: "paragraph",
          text: "IBC is a marketing framework around overfunded whole life policies, popularized by Nelson Nash. The idea: 'be your own bank.' You park money in cash value, borrow against it for purchases (cars, real estate, business expenses), repay yourself at the policy interest rate, and recapture the interest you'd otherwise pay to a bank.",
        },
        {
          type: "paragraph",
          text: "It works mathematically, with caveats. The honest analysis:",
        },
        {
          type: "list",
          items: [
            "Net IRR after fees and opportunity cost is typically 2–4% over 20+ years.",
            "A taxable brokerage holding broad index funds historically returns ~7% real, with full liquidity and zero surrender charges.",
            "A HELOC offers similar collateralized borrowing without the 10–15 year cash-value ramp-up.",
            "The 'tax-free' angle only matters at high incomes with maxed retirement accounts.",
            "The strategy requires consistent premium payment for life — losing a job mid-policy is far more painful than losing access to a brokerage account.",
          ],
        },
        {
          type: "paragraph",
          text: "IBC works for: HNW individuals seeking estate liquidity, business owners with steady cash flow needing collateral for opportunistic deals, people who genuinely will not save without a forced contractual mechanism. It does not work as a substitute for a 401(k), IRA, or 529 for the median household.",
        },
      ],
    },
    {
      id: "when-fits",
      heading: "When permanent insurance actually fits",
      blocks: [
        {
          type: "list",
          items: [
            "Estate over the federal exemption (currently ~$13.6M / person) — irrevocable life insurance trusts (ILIT) provide liquidity for estate taxes.",
            "Special-needs dependents requiring lifetime support (a permanent death benefit is the entire point).",
            "Business buy-sell agreements where partners need guaranteed liquidity at any age.",
            "Maxed retirement accounts AND a high-income earner with stable cash flow seeking additional tax-deferred space.",
            "Forced-savings personalities — when you genuinely cannot save without a contractual obligation.",
            "Medical conditions making term unaffordable but permanent issuable (rare — usually both will be priced steeply).",
          ],
        },
      ],
    },
    {
      id: "the-default",
      heading: "The default for everyone else",
      blocks: [
        {
          type: "paragraph",
          text: "For 90%+ of households, the financially sound stack is:",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Buy a 20- or 30-year level term policy covering 10–15× annual income (or until kids are independent + mortgage paid off).",
            "Take the premium difference between term and what whole life would cost and invest it in: 401(k) up to match → HSA → Roth IRA / Backdoor → 401(k) to max → 529 if relevant → taxable brokerage.",
            "Re-evaluate at 50–55. By then most people don't need life insurance at all because their assets have replaced their income-replacement need.",
          ],
        },
        {
          type: "calculator",
          calculator: "term-vs-whole-life",
          caption: "Compare term + invest the difference vs. whole life over the policy life",
        },
      ],
    },
    {
      id: "if-you-have-one",
      heading: "If you already own a permanent policy",
      blocks: [
        {
          type: "paragraph",
          text: "Don't blow it up reactively. Sunk cost is a real consideration, but so is the opportunity cost of staying.",
        },
        {
          type: "list",
          items: [
            "Past year 10–12, the early-year cost drag is largely behind you. The IRR going forward is the relevant number — request an in-force illustration showing 5/10/20-year forward returns.",
            "1035 exchange: tax-free swap to a lower-cost policy or fixed annuity if structurally better.",
            "Reduced paid-up: stop paying premiums, lock in a smaller death benefit, no more outflow.",
            "Surrender: take the cash value (ordinary income tax on gain above basis). Sometimes the right call if cash value is small relative to alternatives.",
            "Life settlement: in some cases (older insured, larger face amount), a third party will buy the policy for more than surrender value.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Decision framework",
          body: "Ask: 'If I didn't already own this policy, would I buy it today with new money?' If no, the only question is the cleanest exit — surrender, paid-up, or 1035. If yes, keep paying premiums and use it as designed.",
        },
      ],
    },
  ],
};

// ─── Order of Operations ──────────────────────────────────────────────────

const orderOfOperations: Guide = {
  slug: "order-of-operations-where-to-put-your-next-dollar",
  title: "Where to Put Your Next Dollar: The Order of Operations",
  topic: "tax",
  difficulty: "intro",
  summary:
    "The canonical priority list for personal finance — from emergency fund to taxable brokerage — and why each step beats the next.",
  readingMinutes: 11,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Step 1", value: "Emergency fund (1 month)" },
    { label: "Step 2", value: "401(k) up to full match" },
    { label: "Step 3", value: "High-interest debt payoff" },
    { label: "Step 4", value: "HSA (if eligible)" },
    { label: "Step 5", value: "Roth IRA / Backdoor" },
    { label: "Step 6", value: "Max 401(k)" },
  ],
  sections: [
    {
      id: "intro",
      heading: "Why an order matters",
      blocks: [
        {
          type: "paragraph",
          text: "Most people don't fail at personal finance because they pick the wrong investments. They fail because they put dollars in the wrong order — fully funding a Roth before grabbing a 100% employer match, paying off a 3% mortgage before maxing tax-advantaged space, or holding bonds in a taxable brokerage instead of an IRA.",
        },
        {
          type: "paragraph",
          text: "The order of operations is a priority list. Each step's expected return — adjusted for guaranteed-vs-probabilistic returns and tax treatment — is higher than the next. Work top-down. Don't move on until the prior step is at least minimally satisfied.",
        },
      ],
    },
    {
      id: "step-1",
      heading: "Step 1: Starter emergency fund (1 month of expenses)",
      blocks: [
        {
          type: "paragraph",
          text: "Before any investing, hold one month of bare-minimum expenses (rent/mortgage, utilities, food, insurance, debt minimums) in a high-yield savings account. This is not your full emergency fund — that comes later. The point of the starter fund is to keep a flat tire from becoming credit card debt while you do everything else below.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Define expenses honestly",
          body: "If you lost your job tomorrow, what's the smallest dollar amount that keeps you housed and fed? That's the number — not your current spending including discretionary categories.",
        },
      ],
    },
    {
      id: "step-2",
      heading: "Step 2: 401(k) contribution up to the FULL employer match",
      blocks: [
        {
          type: "paragraph",
          text: "An employer match is the highest-return investment available to you, period. A 100%-of-first-4% match is a guaranteed 100% return on the contributed dollars before market returns. There is no other product, strategy, or asset class that returns 100% guaranteed. Capture every cent.",
        },
        {
          type: "calculator",
          calculator: "employer-match-optimizer",
          caption: "Find your minimum contribution to capture the full match",
        },
        {
          type: "paragraph",
          text: "If your plan offers Roth 401(k) and you expect higher tax brackets in retirement, prefer Roth. Otherwise Traditional. Either way: capture the full match before doing anything below.",
        },
      ],
    },
    {
      id: "step-3",
      heading: "Step 3: High-interest debt payoff",
      blocks: [
        {
          type: "paragraph",
          text: "Anything above ~7% interest is high. Credit cards (18–28%), personal loans (10–15%), private student loans (8–12%), auto loans on bad credit. Paying these down is a guaranteed risk-free return equal to the interest rate. The S&P 500 averages ~10% nominal — a guaranteed 22% by paying off a credit card beats it on every dimension.",
        },
        {
          type: "table",
          caption: "Debt prioritization by interest rate",
          headers: ["Rate", "Action", "Reasoning"],
          rows: [
            [
              "≥ 7%",
              "Pay off aggressively before any taxable investing",
              "Guaranteed return ≥ historical equity returns",
            ],
            [
              "4–7%",
              "Optional — depends on risk tolerance & emotional weight",
              "Mathematical edge case; psychological win is real",
            ],
            [
              "< 4% (mortgage, federal student loans)",
              "Pay minimums; invest aggressively elsewhere",
              "Long-term equity returns reliably exceed",
            ],
          ],
          align: ["left", "left", "left"],
        },
      ],
    },
    {
      id: "step-4",
      heading: "Step 4: HSA (if eligible)",
      blocks: [
        {
          type: "paragraph",
          text: "If you have an HDHP, max the HSA next. It's the only triple-tax-advantaged account: deductible contribution, tax-free growth, tax-free qualified withdrawal. Even if you're not on an HDHP this year — keep the option in mind for next open enrollment if your medical spending is predictable and low.",
        },
        {
          type: "callout",
          tone: "info",
          title: "See the dedicated guide",
          body: "The HSA Stealth Retirement guide covers the save-receipts strategy that makes this account beat both Roth and Traditional for many people.",
        },
      ],
    },
    {
      id: "step-5",
      heading: "Step 5: Roth IRA (or Backdoor Roth)",
      blocks: [
        {
          type: "paragraph",
          text: "Max the Roth IRA — $7,000/yr, or $8,000 if 50+. If your income exceeds the direct-contribution phase-out, do the Backdoor Roth (assuming no large pre-tax IRA balance, which would trigger pro-rata).",
        },
        {
          type: "paragraph",
          text: "Why Roth before more 401(k)? IRA dollars give you more investment options (any ETF/stock, often lower-fee than the 401(k) menu), more flexibility (contributions accessible anytime), and Roth's tax-free growth is extremely valuable for long horizons.",
        },
      ],
    },
    {
      id: "step-6",
      heading: "Step 6: Max the 401(k)",
      blocks: [
        {
          type: "paragraph",
          text: "After capturing the match (Step 2) and maxing the IRA (Step 5), return to the 401(k) and push contributions to the annual limit ($23,500 in 2026, $31,000 if 50+).",
        },
        {
          type: "paragraph",
          text: "If your plan supports it, look for after-tax (non-Roth) contribution headroom and Mega Backdoor Roth — this can let high earners stuff up to ~$70K/yr (2026 total addition limit) into Roth space. Plan-dependent, so check your Summary Plan Description.",
        },
      ],
    },
    {
      id: "step-7",
      heading: "Step 7: Full emergency fund (3–6 months)",
      blocks: [
        {
          type: "paragraph",
          text: "With tax-advantaged accounts maxed and high-interest debt eliminated, build the emergency fund up to 3 months (dual-income, stable jobs) or 6 months (single-income, volatile industry). High-yield savings or Treasury bills — not equities. The point is it's there when needed, not maximizing return.",
        },
      ],
    },
    {
      id: "step-8",
      heading: "Step 8: 529 / education accounts (if you have kids)",
      blocks: [
        {
          type: "paragraph",
          text: "If education funding is a goal, fund 529s now. Many states give a state tax deduction. Earlier funding compounds longer. With the SECURE 2.0 Roth rollover, even unused 529 funds have an exit ramp.",
        },
        {
          type: "paragraph",
          text: "Do NOT fund 529s before maxing your own retirement — your kids can borrow for college, you cannot borrow for retirement.",
        },
      ],
    },
    {
      id: "step-9",
      heading: "Step 9: Taxable brokerage",
      blocks: [
        {
          type: "paragraph",
          text: "After all tax-advantaged space is maxed, contribute to a taxable brokerage. This is also where you build wealth for goals before traditional retirement age (early retirement, sabbatical, real estate down payment).",
        },
        {
          type: "paragraph",
          text: "Tax efficiency matters here. Hold broad index funds (low turnover, qualified dividends), use tax-loss harvesting, avoid REITs/bonds in taxable. See the Asset Location glossary entry for placement strategy.",
        },
      ],
    },
    {
      id: "step-10",
      heading: "Step 10: Pay down low-interest debt early (optional)",
      blocks: [
        {
          type: "paragraph",
          text: "Mortgages under 5% and federal student loans rarely benefit mathematically from accelerated payoff. Equity returns historically exceed these rates substantially. But emotional finance is real — if a paid-off mortgage helps you sleep at night and you've already maxed every step above, it's a defensible choice.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "Don't sacrifice tax-advantaged space for it",
          body: "Skipping IRA/401(k) contributions to make extra mortgage payments is almost always a mistake. Tax-advantaged contribution room used isn't recoverable — once the year ends, that contribution slot is gone forever.",
        },
      ],
    },
    {
      id: "edge-cases",
      heading: "Edge cases & adjustments",
      blocks: [
        {
          type: "list",
          items: [
            "No 401(k) match: skip Step 2, go straight to debt payoff and Roth.",
            "Self-employed: replace 401(k) steps with Solo 401(k) or SEP-IRA.",
            "Pension expected: weight toward Roth (pension income occupies low brackets in retirement).",
            "Early retirement plans: invest more in taxable + Roth to build a bridge before 59½.",
            "Income-based student loan repayment (PSLF, IDR): pay minimums and prioritize tax-advantaged contributions to lower AGI.",
            "FIRE / financially independent: continue maxing tax-advantaged space; use Roth Conversion Ladder for early access.",
          ],
        },
      ],
    },
  ],
};

// ─── Backdoor + Mega Backdoor Roth ───────────────────────────────────────

const backdoorRoth: Guide = {
  slug: "backdoor-and-mega-backdoor-roth",
  title: "Backdoor & Mega Backdoor Roth: The Practical Playbook",
  topic: "retirement",
  difficulty: "advanced",
  summary:
    "Step-by-step mechanics, the pro-rata trap, employer plan requirements, and how high earners can move $50K+/yr into Roth.",
  readingMinutes: 12,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Direct Roth Income Limit (Single)", value: "$165K MAGI (2026)" },
    { label: "Direct Roth Income Limit (MFJ)", value: "$246K MAGI (2026)" },
    { label: "Backdoor Annual Limit", value: "$7,000 / $8,000 (50+)" },
    { label: "Mega Backdoor Annual", value: "Up to ~$46,500 over 401(k)+match" },
    { label: "Pro-Rata Rule Trap", value: "Pre-tax IRA balance taxes conversion" },
    { label: "Plan Requirement", value: "After-tax contributions + in-service withdrawal/conversion" },
  ],
  sections: [
    {
      id: "why",
      heading: "Why these strategies exist",
      blocks: [
        {
          type: "paragraph",
          text: "Roth IRAs have an income cap. Above ~$165K single / ~$246K MFJ MAGI in 2026, you can't contribute directly. The Backdoor Roth and Mega Backdoor Roth are legal workarounds that the IRS has explicitly blessed (the Backdoor was even acknowledged in conference reports during the Tax Cuts and Jobs Act drafting). They let high earners — exactly the people who benefit most from tax-free growth — keep funding Roth space anyway.",
        },
        {
          type: "callout",
          tone: "info",
          title: "Two different strategies",
          body: "The Backdoor moves $7K/yr into Roth via the IRA system. The Mega Backdoor moves up to ~$46K/yr via the 401(k) system. Different rules, different traps. Most high earners can do the Backdoor; only some can do the Mega Backdoor.",
        },
      ],
    },
    {
      id: "backdoor-mechanics",
      heading: "Backdoor Roth: the mechanics",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Open a Traditional IRA at your brokerage if you don't have one.",
            "Make a $7,000 NON-DEDUCTIBLE contribution. (You file Form 8606 with your taxes to record the basis.)",
            "Wait 1 day to a few days for the contribution to settle (the 'wait one day' rule is folklore — there's no IRS-required waiting period, but most brokerages need settlement).",
            "Convert the entire Traditional IRA balance to a Roth IRA. Choose 'Roth Conversion' in your brokerage UI.",
            "File Form 8606 with that year's tax return to document the basis and conversion.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Form 8606 is non-negotiable",
          body: "Forgetting Form 8606 is the most common Backdoor mistake. Without it, the IRS treats your contribution as having zero basis, and you pay tax on the entire conversion — turning a tax-free move into a taxable one.",
        },
      ],
    },
    {
      id: "pro-rata",
      heading: "The pro-rata trap (read this carefully)",
      blocks: [
        {
          type: "paragraph",
          text: "The IRS pro-rata rule looks at your TOTAL pre-tax IRA balances at year-end (Traditional, SEP, SIMPLE, Rollover IRA — but NOT 401(k)s) and treats your conversion as proportionally taxable.",
        },
        {
          type: "paragraph",
          text: "Example: You have $93,000 in a Rollover IRA from an old 401(k) and you make a $7,000 non-deductible contribution. Total IRA: $100,000. Of that, $7,000 (7%) is your basis (after-tax). When you convert $7,000, only 7% of the conversion ($490) is tax-free; 93% ($6,510) is taxable.",
        },
        {
          type: "table",
          caption: "Pro-rata math at conversion",
          headers: ["Pre-Tax IRA", "After-Tax (Backdoor)", "% After-Tax", "Taxable Portion of $7K Conversion"],
          rows: [
            ["$0", "$7,000", "100%", "$0"],
            ["$10,000", "$7,000", "41%", "$4,118"],
            ["$50,000", "$7,000", "12%", "$6,140"],
            ["$93,000", "$7,000", "7%", "$6,510"],
          ],
          align: ["right", "right", "right", "right"],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Workaround: roll pre-tax to your 401(k)",
          body: "Your employer 401(k) is NOT counted in pro-rata math. If your plan accepts incoming rollovers, roll your pre-tax IRA balance INTO your 401(k) before December 31. Now your IRA balance is $7K of pure basis, and the conversion is fully tax-free. The Roth side rolls cleanly out.",
        },
      ],
    },
    {
      id: "step-doctrine-myth",
      heading: "The 'step transaction doctrine' myth",
      blocks: [
        {
          type: "paragraph",
          text: "For years, advisors warned to wait months between contribution and conversion to avoid the IRS deeming it a single illegal transaction. Congressional report language from the TCJA confirmed Backdoor Roths are permissible regardless of timing. The IRS has not pursued any cases on step-transaction grounds for Backdoor Roths.",
        },
        {
          type: "paragraph",
          text: "Practical guidance: same-day or next-day conversion is fine. The only reason to wait at all is to let the brokerage settle the contribution and to avoid converting any small interest accrued (which would be taxable, but it's $0.50, so who cares).",
        },
      ],
    },
    {
      id: "mega-backdoor",
      heading: "The Mega Backdoor Roth",
      blocks: [
        {
          type: "paragraph",
          text: "The Mega Backdoor leverages a different account: your 401(k). Three things have to be true at your employer:",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Your 401(k) plan accepts AFTER-TAX (not Roth, not pre-tax) employee contributions on top of the regular $23,500 limit.",
            "The plan offers either in-plan Roth conversion OR in-service withdrawal of after-tax dollars.",
            "You have headroom under the total annual addition limit ($70,000 in 2026).",
          ],
        },
        {
          type: "paragraph",
          text: "Math: if you contribute $23,500 (employee deferral) and your employer contributes $10,000 (match), your remaining headroom under the $70K limit is $36,500. That $36,500 can go in as after-tax contributions and immediately convert to Roth — either inside the 401(k) (in-plan Roth) or by rolling out to a Roth IRA (in-service withdrawal).",
        },
        {
          type: "table",
          caption: "Mega Backdoor headroom example (2026)",
          headers: ["Bucket", "Amount"],
          rows: [
            ["Total annual addition limit", "$70,000"],
            ["Employee deferral (Roth or Traditional)", "$23,500"],
            ["Employer match", "$10,000"],
            ["Remaining headroom = After-tax + Mega Backdoor", "$36,500"],
          ],
          align: ["left", "right"],
        },
      ],
    },
    {
      id: "mega-execution",
      heading: "Executing the Mega Backdoor",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Confirm with HR or your 401(k) administrator that after-tax contributions are allowed.",
            "Confirm the conversion path: in-plan Roth conversion, in-service withdrawal to Roth IRA, or both.",
            "Set your after-tax contribution rate. Most plans cap as a % of pay — you may need to adjust mid-year if your bonus structure is irregular.",
            "Enable AUTO-conversion if available. Otherwise convert manually monthly or quarterly. The longer dollars sit in after-tax (not Roth), the more growth becomes taxable on conversion.",
            "Confirm conversions show up correctly on your W-2 (Box 12 codes) and 1099-R (if rolled out).",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Conversion timing matters",
          body: "If after-tax dollars accrue $500 of growth before conversion, that $500 becomes taxable income at conversion. Auto-convert weekly or monthly to keep growth minimal. Some plans only allow quarterly or annual conversion — accept the small tax drag, it's still a great deal.",
        },
      ],
    },
    {
      id: "spousal",
      heading: "Spousal Backdoor",
      blocks: [
        {
          type: "paragraph",
          text: "Married couples can each do their own Backdoor: $7K × 2 = $14K/yr into Roth. The spouse without earned income can use a Spousal IRA backed by the working spouse's earnings — same Backdoor mechanics apply.",
        },
        {
          type: "paragraph",
          text: "Pro-rata is calculated PER PERSON. If one spouse has a large pre-tax IRA and the other doesn't, only the first spouse needs the 401(k) rollover workaround — the other can do a clean Backdoor.",
        },
      ],
    },
    {
      id: "common-mistakes",
      heading: "Common mistakes",
      blocks: [
        {
          type: "list",
          items: [
            "Forgetting Form 8606 (most common — leads to double-taxation).",
            "Triggering pro-rata by ignoring a Rollover IRA balance.",
            "Contributing to the Traditional IRA in the wrong tax year (be explicit when you contribute — January counts toward the prior year if you specify).",
            "Selecting 'Pre-tax / Deductible' instead of 'Non-deductible' contribution (this messes up the basis tracking).",
            "Letting after-tax 401(k) dollars sit and grow before conversion (creates unnecessary taxable income at conversion).",
            "Failing to verify your 401(k) plan supports after-tax + conversion before assuming Mega Backdoor is available.",
          ],
        },
      ],
    },
  ],
};

// ─── Term Life Insurance ──────────────────────────────────────────────────

const termLife: Guide = {
  slug: "term-life-insurance",
  title: "Term Life Insurance: The Right Answer for Most People",
  topic: "insurance",
  difficulty: "intro",
  summary:
    "How much, what term length, when to lock in, and why ladder strategies often beat a single large policy.",
  readingMinutes: 9,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Coverage Rule of Thumb", value: "10–15× annual income" },
    { label: "Common Term Lengths", value: "10 / 15 / 20 / 30 yr" },
    { label: "Healthy 35yo, $1M / 20yr", value: "~$25/month" },
    { label: "Healthy 35yo, $1M / 30yr", value: "~$45/month" },
    { label: "Underwriting Window", value: "4–8 weeks typical" },
    { label: "Death Benefit", value: "Income tax-free to beneficiary" },
  ],
  sections: [
    {
      id: "purpose",
      heading: "What term life insurance is actually for",
      blocks: [
        {
          type: "paragraph",
          text: "Term life insurance is income-replacement insurance for the years your family depends on your income. It pays a tax-free lump sum to your beneficiaries if you die during the term. No cash value, no investment component, no permanent coverage — just pure protection at the lowest possible cost.",
        },
        {
          type: "paragraph",
          text: "The right way to think about term life: you're not buying lifetime coverage, you're buying coverage UNTIL your assets and dependents' independence make insurance unnecessary. By 50–60, most people don't need life insurance at all — kids are launched, mortgage is paid down, retirement assets cover the surviving spouse.",
        },
      ],
    },
    {
      id: "how-much",
      heading: "How much coverage do you need?",
      blocks: [
        {
          type: "paragraph",
          text: "The lazy heuristic is 10× annual income. Better: think about what your family actually needs replaced.",
        },
        {
          type: "list",
          items: [
            "Income replacement: Annual income × years until kids are independent",
            "Mortgage payoff: Outstanding balance",
            "Education funding: Estimated college costs × number of kids (or current 529 shortfall)",
            "Final expenses: ~$15K (funeral, estate cleanup)",
            "Existing assets / spouse's income: SUBTRACT (they reduce the need)",
          ],
        },
        {
          type: "key-value",
          caption: "Example: 35yo, two young kids, $120K income",
          pairs: [
            { label: "Income replacement", value: "$120K × 18 yrs = $2.16M" },
            { label: "Mortgage payoff", value: "$350,000" },
            { label: "Education funding", value: "$200,000 (2 kids × $100K)" },
            { label: "Final expenses", value: "$15,000" },
            { label: "Subtract: existing 401(k)", value: "−$80,000" },
            { label: "Subtract: spouse's income (PV)", value: "−$500,000" },
            { label: "Coverage need", value: "~$2,150,000" },
          ],
        },
        {
          type: "paragraph",
          text: "Round up to the nearest standard policy size ($2M is more common than $2.15M). Slightly over-insuring is cheap insurance against under-insuring.",
        },
      ],
    },
    {
      id: "term-length",
      heading: "Choosing the term length",
      blocks: [
        {
          type: "paragraph",
          text: "Match the term to when your family stops needing the income replacement. For a 30yo with a newborn, 30 years gets you to age 60 — kids are 30, mortgage is paid, retirement assets are substantial. For a 45yo with two teenagers, 20 years gets you to 65 — kids are launched, retirement is here.",
        },
        {
          type: "paragraph",
          text: "Common pricing tradeoffs (healthy non-smoker, $1M coverage, 35yo):",
        },
        {
          type: "table",
          headers: ["Term", "Approx Monthly Premium", "When to Pick"],
          rows: [
            [
              "10 yr",
              "$15–20",
              "Older, near-retirement, or covering a specific 10-yr obligation",
            ],
            [
              "20 yr",
              "$25–35",
              "Sweet spot for 30s/40s parents — gets you to kids' independence",
            ],
            [
              "30 yr",
              "$40–60",
              "Young parents (under 35) wanting maximum runway",
            ],
            [
              "40 yr (rare)",
              "$70+",
              "Some carriers offer; rarely worth the spread",
            ],
          ],
        },
      ],
    },
    {
      id: "ladder",
      heading: "The ladder strategy",
      blocks: [
        {
          type: "paragraph",
          text: "Instead of a single $2M / 30-year policy, consider laddering: two or three policies of different terms that together provide more coverage early (when needs are highest) and less later (when needs decline).",
        },
        {
          type: "key-value",
          caption: "Example ladder for a 35yo with $2M need",
          pairs: [
            { label: "Policy 1", value: "$1M / 10-yr" },
            { label: "Policy 2", value: "$500K / 20-yr" },
            { label: "Policy 3", value: "$500K / 30-yr" },
            { label: "Coverage years 1–10", value: "$2,000,000" },
            { label: "Coverage years 11–20", value: "$1,000,000" },
            { label: "Coverage years 21–30", value: "$500,000" },
            { label: "Total monthly premium", value: "~$45 (vs. ~$70 for $2M / 30-yr)" },
          ],
        },
        {
          type: "paragraph",
          text: "Why it works: insurance needs naturally decline as kids grow up, the mortgage shrinks, and retirement assets accumulate. The ladder reflects this. Total premium across the three is typically 30–40% less than a single 30-year policy with the same peak coverage.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Practical execution",
          body: "Buy all three policies on the same application from the same carrier when possible — single underwriting, single set of medical exams, single conversion option if your health changes. Apply at the same age for the longest term you'll keep.",
        },
      ],
    },
    {
      id: "when-to-buy",
      heading: "When to buy",
      blocks: [
        {
          type: "list",
          items: [
            "As soon as anyone depends on your income — spouse, child, business partner.",
            "Before a major health event you can predict (surgery, weight changes, family history activating).",
            "While young and healthy. A 25yo locks in 30 years of $1M coverage for ~$20/month. A 45yo pays $90/month for the same policy — and may not qualify at all if health has shifted.",
            "Before pregnancy if possible — pregnancy is sometimes 'rated' (charged extra) by some carriers.",
            "Before quitting a stable job to start a business — easier to underwrite with W-2 income.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Don't wait for the 'right time'",
          body: "Term insurance gets more expensive every year and harder to qualify for as health changes. Locked-in level term protects you from both. The cheapest premium you'll ever see is one you lock in at age 25.",
        },
      ],
    },
    {
      id: "shopping",
      heading: "Shopping for a policy",
      blocks: [
        {
          type: "list",
          items: [
            "Use a broker (independent), not a captive agent. Brokers shop multiple carriers; captives sell their employer's policies only.",
            "Get quotes from 3+ carriers — premiums for identical coverage can vary 30%+.",
            "Top-rated carriers (financial strength A or better): Banner Life, Pacific Life, Protective, AIG / Corebridge, Symetra, MassMutual.",
            "Online quote tools (Policygenius, Term4Sale, Quotacy, Haven Life) let you compare without committing.",
            "Be honest on the application. Misrepresentation can void the policy — 'contestability period' is the first 2 years.",
            "Get a medical exam unless you specifically want no-exam coverage (which costs 20–40% more).",
          ],
        },
      ],
    },
    {
      id: "convertibility",
      heading: "Convertibility and other riders",
      blocks: [
        {
          type: "paragraph",
          text: "Most term policies include a CONVERSION option — you can convert to permanent insurance later without re-underwriting. Useful if your health declines mid-term and you want lifetime coverage. Otherwise, ignore it.",
        },
        {
          type: "list",
          items: [
            "Waiver of premium: premiums waived if you become disabled. Inexpensive, often worth it.",
            "Accidental death rider: usually overpriced — your need for coverage doesn't depend on cause of death.",
            "Return of premium: pays back premiums at end of term if you didn't die. Sounds great but premiums are 2–3× higher; you'd do better investing the difference.",
            "Child rider: small face amount on each child for ~$5/mo. Reasonable for peace of mind, not a replacement for proper coverage.",
            "Conversion: usually free with the base policy. Read your specific contract for the conversion window.",
          ],
        },
      ],
    },
    {
      id: "vs-permanent",
      heading: "Why not permanent?",
      blocks: [
        {
          type: "paragraph",
          text: "The Permanent Life Insurance guide goes deep on this. Short version: term costs 5–15× less than whole life or IUL for the same coverage. The premium savings, invested in tax-advantaged accounts, end up worth more than the cash value of permanent insurance for 90%+ of buyers.",
        },
        {
          type: "calculator",
          calculator: "term-vs-whole-life",
          caption: "Compare term + invest the difference vs. whole life",
        },
      ],
    },
  ],
};

// ─── Trader Tax Status & §475(f) Mark-to-Market Election ────────────────

const traderTaxMtm: Guide = {
  slug: "trader-tax-status-and-mtm-election",
  title: "Trader Tax Status & §475(f) Mark-to-Market Election",
  topic: "tax",
  difficulty: "advanced",
  summary:
    "Who qualifies, what the election actually does, deadlines and forms, and the irreversible commitment you're making.",
  readingMinutes: 14,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Election Deadline", value: "April 15 of election year" },
    { label: "Loss Limit Removed", value: "$3K → unlimited (ordinary)" },
    { label: "Wash Sales", value: "Exempted under MTM" },
    { label: "Treatment", value: "Ordinary income, not capital" },
    { label: "Forms", value: "Form 4797 + Form 3115" },
    { label: "Reversibility", value: "Difficult — formal IRS approval needed" },
  ],
  sections: [
    {
      id: "two-things",
      heading: "Two separate things — don't confuse them",
      blocks: [
        {
          type: "paragraph",
          text: "There are two distinct concepts here, and most online discussion blurs them. Understanding the difference is critical because they have very different effects on your taxes.",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Trader Tax Status (TTS) — IRS classification based on case law (Holsinger, Endicott). Lets you deduct trading expenses on Schedule C. Does NOT change how gains are taxed or eliminate wash sales.",
            "§475(f) Mark-to-Market Election — A formal election that converts gains/losses to ordinary income, removes the $3K loss limit, and exempts you from wash-sale rules. Requires TTS to elect, but TTS does not require the election.",
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "You can have TTS without MTM",
          body: "Many traders qualify for TTS (claim Schedule C expenses) while still treating their gains as capital and reporting on Form 8949. They keep wash-sale rules and the $3K loss limit but get expense deductions. MTM is the bigger commitment.",
        },
      ],
    },
    {
      id: "qualifying-tts",
      heading: "Qualifying for Trader Tax Status",
      blocks: [
        {
          type: "paragraph",
          text: "There's no IRS form to apply — you self-declare on your tax return. But the IRS can challenge it, and case law has produced rough quantitative tests. The leading cases are Holsinger (2008) and Endicott (2013).",
        },
        {
          type: "table",
          caption: "Practitioner-consensus TTS thresholds (case-law based)",
          headers: ["Factor", "Approximate Threshold", "Why It Matters"],
          rows: [
            [
              "Trade frequency",
              "4+ trades/day, 720+ trades/year",
              "Demonstrates active business, not investing",
            ],
            [
              "Trading days",
              "75%+ of available trading days active",
              "Continuity — sporadic trading fails",
            ],
            [
              "Average holding period",
              "Under 31 days; under 7 days for day-traders",
              "Short-term focus signals trading vs. investing",
            ],
            [
              "Hours per day",
              "4+ hours typical",
              "Shows business-like activity",
            ],
            [
              "Income source",
              "Trading is primary or material livelihood",
              "Hobby traders generally fail",
            ],
            [
              "Equipment & subscriptions",
              "Multi-monitor, real-time data, charting tools",
              "Indicia of a trade or business",
            ],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Part-time / W-2 day-job traders",
          body: "Endicott had a full-time job and was denied TTS. The IRS argued his trading wasn't his primary livelihood. Part-time traders can still qualify but face higher scrutiny — more documentation, clearer separation between investment and trading accounts, demonstrable hours.",
        },
      ],
    },
    {
      id: "what-mtm-does",
      heading: "What the §475(f) MTM election actually does",
      blocks: [
        {
          type: "list",
          items: [
            "Converts trading gains and losses to ORDINARY income (no more capital-gain rates — both good and bad).",
            "Removes the $3,000 capital loss limit. Big trading losses fully offset other income (W-2, business, etc.) in the year incurred.",
            "Exempts trading positions from wash-sale rules — you can sell at a loss and rebuy the same security minutes later with no disallowance.",
            "Year-end open positions are 'marked to market' — deemed sold at FMV on Dec 31 for tax purposes; basis resets Jan 1.",
            "Trading reported on Form 4797 Part II, not Schedule D / Form 8949.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Why active traders elect MTM",
          body: "If you're netting six-figure trading losses in a bad year, the $3K capital loss limit is brutal — you carry forward the rest for decades while still owing tax on your W-2 income. MTM lets a $200K trading loss offset $200K of other income immediately. For active traders, that asymmetric protection is the entire point.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "The other side: gains become ordinary",
          body: "MTM also gives up long-term capital-gains rates. If you have positions held over a year (rare for active traders), those would have been taxed at 15-20% as LTCG; under MTM they're ordinary at up to 37%. For pure day-traders this rarely matters; for swing traders it can.",
        },
      ],
    },
    {
      id: "deadline",
      heading: "The election deadline (don't miss this)",
      blocks: [
        {
          type: "paragraph",
          text: "The election must be filed BY APRIL 15 OF THE TAX YEAR YOU WANT IT TO APPLY. This is the single most important date in the entire process and a common reason traders fail to elect when they meant to.",
        },
        {
          type: "key-value",
          caption: "Election timing",
          pairs: [
            { label: "Want MTM for 2026?", value: "File election by April 15, 2026 (with 2025 return)" },
            { label: "Want MTM for 2027?", value: "File election by April 15, 2027 (with 2026 return)" },
            { label: "Missed the deadline?", value: "Wait until next year — no late election" },
          ],
        },
        {
          type: "paragraph",
          text: "The election is filed as a written statement attached to your prior year's return (or the return for the year before the year you want it to apply). For first-time filers, it's attached to a timely-filed extension request (Form 4868) by April 15.",
        },
      ],
    },
    {
      id: "how-to-elect",
      heading: "How to actually file the election",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Draft an election statement: Internal Revenue Code §475(f), name, SSN, that you elect MTM for the trade or business of trading securities effective for the tax year [YEAR].",
            "Attach the statement to your prior-year tax return OR to a timely-filed Form 4868 (extension request) by April 15.",
            "In the year of election, file Form 3115 (Application for Change in Accounting Method) to formalize the §481(a) adjustment for the transition. Two copies: one with the return, one mailed to the IRS National Office.",
            "Going forward, report all trading on Form 4797 Part II — ordinary income/loss.",
            "On December 31 of each year, mark all open positions to fair market value. Basis resets January 1.",
          ],
        },
        {
          type: "callout",
          tone: "danger",
          title: "Use a CPA who's done this",
          body: "Form 3115 is non-trivial. The §481(a) adjustment (transition treatment of pre-election open positions) trips up DIY filers. The IRS scrutinizes botched 475 elections. Spend the few hundred dollars on a trader-tax CPA — Robert Green / Greentrader.com is the canonical resource.",
        },
      ],
    },
    {
      id: "irreversibility",
      heading: "The irreversibility problem",
      blocks: [
        {
          type: "paragraph",
          text: "Once you elect §475(f), revoking it requires formal IRS consent via another Form 3115 — and the IRS rarely grants it. Practical effect: the election is one-way. You're committing to ordinary-income treatment indefinitely, even if your trading style changes (e.g., you start swing trading and want LTCG treatment again).",
        },
        {
          type: "paragraph",
          text: "This is why the election shouldn't be made casually. Best candidates: full-time day-traders with predictable high-frequency activity. Worst candidates: traders who oscillate between active day-trading and longer-horizon investing.",
        },
      ],
    },
    {
      id: "wash-sale-impact",
      heading: "What MTM does to wash sales",
      blocks: [
        {
          type: "paragraph",
          text: "Under MTM, §1091 wash-sale rules don't apply to trading positions. This is a meaningful operational benefit, not just a tax-rate question.",
        },
        {
          type: "list",
          items: [
            "Without MTM: scalping the same stock dozens of times can disallow most realized losses for the year, deferring them into the basis of follow-on purchases.",
            "With MTM: every sale produces a clean ordinary loss or gain. Tax accounting matches your actual P&L exactly.",
            "Year-end harvesting becomes irrelevant — losses are immediately usable.",
            "Note: investment positions you hold OUTSIDE the trading business (long-term portfolio in a separate account) still follow regular rules. The election applies to your trading activity only.",
          ],
        },
        {
          type: "calculator",
          calculator: "tax-loss-harvesting",
          caption: "TLH still matters for non-trader portfolios — see how losses flow",
        },
      ],
    },
    {
      id: "when-it-fits",
      heading: "When MTM is the right call",
      blocks: [
        {
          type: "list",
          items: [
            "Full-time day-traders with consistent multi-year track records and clear TTS qualification.",
            "Traders whose annual P&L volatility means a large loss year is plausible — the $3K limit removal is the biggest practical win.",
            "Traders running into wash-sale paperwork hell on dozens of symbols.",
            "Traders with no W-2 income to absorb capital losses against (so the $3K limit hurts more).",
            "Traders setting up a trading entity (LLC/S-Corp) where the election is being applied entity-wide.",
          ],
        },
      ],
    },
    {
      id: "when-it-doesnt",
      heading: "When MTM is the WRONG call",
      blocks: [
        {
          type: "list",
          items: [
            "Hybrid traders/investors who hold long-term positions for LTCG treatment.",
            "Traders whose income is primarily long-term gains (the rate spread is too costly).",
            "Anyone who doesn't reliably meet TTS — the IRS can disallow both TTS and the election.",
            "Traders with stable years and small P&L — the $3K limit doesn't bite, and MTM's complexity isn't worth it.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Halfway-house option",
          body: "Many active traders adopt TTS (Schedule C deductions, no election), keep capital-gain treatment, and use careful position sizing to avoid catastrophic loss years. This captures the expense-deduction win without the irreversibility of MTM.",
        },
      ],
    },
    {
      id: "state-coordination",
      heading: "State tax coordination",
      blocks: [
        {
          type: "paragraph",
          text: "Most states automatically conform to the federal §475(f) election — but check your state's rules. A few states (notably California and New York) have nuances around how MTM-electing traders report. Some states deny ordinary loss treatment for state purposes even if federally allowed.",
        },
        {
          type: "paragraph",
          text: "If you live in a high-tax state (CA, NY, NJ) and trade actively, factor state coordination into the election decision. A trader-tax CPA familiar with your state is essential.",
        },
      ],
    },
    {
      id: "resources",
      heading: "Further resources",
      blocks: [
        {
          type: "list",
          items: [
            "GreenTraderTax.com — Robert Green's blog and books are the canonical practitioner resource for trader tax issues.",
            "IRS Publication 550 — Investment Income and Expenses (general framework).",
            "IRS Topic 429 — Traders in Securities (official IRS positioning).",
            "Holsinger v. Commissioner (2008), Endicott v. Commissioner (2013) — leading TTS cases.",
            "Rev. Proc. 99-17 — procedures for making and revoking the §475(f) election.",
          ],
        },
      ],
    },
  ],
};

// ─── Wash Sale Deep Dive ─────────────────────────────────────────────────

const washSaleDeepDive: Guide = {
  slug: "wash-sale-rules-deep-dive",
  title: "Wash Sale Rules: A Deep Dive",
  topic: "tax",
  difficulty: "intermediate",
  summary:
    "How §1091 actually works, the cross-account and cross-spouse traps, the IRA permanent-loss disaster, and ETF swap strategies that hold up.",
  readingMinutes: 11,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Window", value: "30 days BEFORE and AFTER" },
    { label: "Spouse Account", value: "Counted (§1091)" },
    { label: "IRA Replacement", value: "Permanent loss (Rev. Rul. 2008-5)" },
    { label: "Disallowed Loss", value: "Adds to replacement's basis" },
    { label: "Holding Period", value: "Carries from original lot" },
    { label: "MTM Exemption", value: "§475(f) electors exempt" },
  ],
  sections: [
    {
      id: "the-rule",
      heading: "The rule itself",
      blocks: [
        {
          type: "paragraph",
          text: "Under IRC §1091, you cannot deduct a loss from selling a security if, within a 61-day window centered on the sale (30 days before, the sale day, 30 days after), you ALSO acquire a substantially identical security. The disallowed loss isn't gone forever — it adds to the basis of the replacement security and carries the original holding period.",
        },
        {
          type: "key-value",
          caption: "Mechanics example",
          pairs: [
            { label: "Buy 100 SPY @ $500", value: "Cost basis $50,000" },
            { label: "Sell 100 SPY @ $450", value: "Realized $5,000 loss" },
            { label: "Buy 100 SPY @ $460 within 30 days", value: "Wash sale" },
            { label: "$5,000 loss disallowed", value: "Added to new lot's basis" },
            { label: "New lot's adjusted basis", value: "$46,000 + $5,000 = $51,000" },
            { label: "When you eventually sell that lot", value: "Loss is recovered then" },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Wash sales defer, they don't kill (usually)",
          body: "In a regular taxable account, a wash sale just delays the loss recognition until you sell the replacement. The exception is when the replacement is in an IRA — see below.",
        },
      ],
    },
    {
      id: "the-window",
      heading: "Understanding the 61-day window",
      blocks: [
        {
          type: "paragraph",
          text: "The window cuts both directions from the sale date — many beginners miss this.",
        },
        {
          type: "list",
          items: [
            "If you BUY shares on Dec 1, then SELL at a loss on Dec 15 — wash sale (purchase was within 30 days before the sale).",
            "If you SELL at a loss on Dec 15, then BUY shares on Dec 28 — wash sale (purchase within 30 days after).",
            "If you BUY on Nov 1, SELL at a loss on Dec 15, then BUY again on Jan 20 — wash sale on the November purchase, not the January one.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "December tax-loss harvesting trap",
          body: "Selling for a loss on Dec 28 and buying back on Jan 5 of the new year is STILL a wash sale. The window doesn't reset at year-end. Wait at least 31 days, or buy a non-substantially-identical replacement.",
        },
      ],
    },
    {
      id: "spouse-and-cross-account",
      heading: "Spouse accounts and cross-account purchases (§1091 traps)",
      blocks: [
        {
          type: "paragraph",
          text: "§1091 explicitly aggregates purchases by you AND your spouse, AND across all your accounts (taxable, IRA, employer 401(k), DRIP plans). You can't escape a wash sale by buying the replacement in a different account — even one you didn't realize was buying.",
        },
        {
          type: "list",
          items: [
            "Sell SPY at a loss in your taxable brokerage; spouse buys SPY in their account → wash sale.",
            "Sell SPY at a loss; your DRIP automatically reinvests dividends back into SPY a week later → wash sale on the reinvested amount.",
            "Sell SPY at a loss; your 401(k)'s S&P 500 fund makes a scheduled buy → arguably a wash sale (caselaw murky; conservative answer is yes).",
            "Sell at a loss in your traditional IRA, replacement bought in your Roth IRA → wash sale within IRA, but rule rarely matters since IRA gains/losses aren't recognized anyway.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Coordinate with your spouse",
          body: "Before harvesting losses, check what your spouse is buying that month. Auto-investment plans (DRIP, 401(k), HSA, IRA) are silent wash-sale generators if either spouse holds the same security elsewhere.",
        },
      ],
    },
    {
      id: "ira-trap",
      heading: "The IRA permanent-loss disaster (Rev. Rul. 2008-5)",
      blocks: [
        {
          type: "paragraph",
          text: "Under IRS Revenue Ruling 2008-5, when the wash-sale replacement is bought in a tax-advantaged account (IRA, 401(k), HSA), the disallowed loss is PERMANENTLY LOST — there's no basis adjustment because the IRA doesn't track basis the same way.",
        },
        {
          type: "key-value",
          caption: "Worst-case example",
          pairs: [
            { label: "Sell 100 SPY at $50K loss in taxable account", value: "Dec 10" },
            { label: "Replace with SPY in your Roth IRA", value: "Dec 15" },
            { label: "Wash sale triggered", value: "$50K loss disallowed" },
            { label: "Basis adjustment in IRA?", value: "NO — loss vanishes" },
            { label: "Tax consequence", value: "$50K real loss, $0 deductible, no future recovery" },
          ],
        },
        {
          type: "callout",
          tone: "danger",
          title: "Audit-driven, manual catch only",
          body: "Brokers don't track wash sales across your taxable + IRA accounts (they only see one account each). You're responsible for surfacing them on your tax return. The IRS catches these via 1099 reconciliation when they get suspicious. Better to never trigger them in the first place.",
        },
      ],
    },
    {
      id: "substantially-identical",
      heading: "What &apos;substantially identical&apos; actually means",
      blocks: [
        {
          type: "paragraph",
          text: "There's no bright-line IRS guidance. Practitioner consensus has emerged around several patterns:",
        },
        {
          type: "table",
          caption: "Substantially-identical patterns",
          headers: ["Comparison", "Substantially Identical?", "Reasoning"],
          rows: [
            [
              "Same ticker (SPY → SPY)",
              "Yes",
              "Identical CUSIP",
            ],
            [
              "S&P 500 ETFs (SPY → IVV → VOO → SPLG)",
              "Yes (consensus)",
              "Track same index, sometimes same prospectus",
            ],
            [
              "S&P 500 → Total Market (SPY → VTI)",
              "No (consensus)",
              "Different index methodology, different holdings count",
            ],
            [
              "S&P 500 → Equal-Weight S&P (SPY → RSP)",
              "No (consensus)",
              "Different weighting methodology",
            ],
            [
              "S&P 500 → Russell 1000 (SPY → IWB)",
              "No (consensus)",
              "Different index provider, different holdings",
            ],
            [
              "Stock and its options (AAPL → AAPL calls)",
              "Yes (treasury reg)",
              "Treas. Reg. §1.1233-1 — options with same underlying",
            ],
            [
              "Different bonds same issuer",
              "Sometimes",
              "Same coupon + maturity = yes; different = no",
            ],
            [
              "Active fund vs index fund (same category)",
              "No",
              "Different management, different holdings",
            ],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Conservative practice",
          body: "Tax pros generally avoid swapping among the four big S&P 500 ETFs (SPY, IVV, VOO, SPLG) for harvesting because the IRS could plausibly call them substantially identical. Standard safe pattern: SPY → VTI (S&P 500 → total market) for harvesting, then back to SPY after 31 days if desired.",
        },
      ],
    },
    {
      id: "etf-swap-pairs",
      heading: "Reliable ETF swap pairs for harvesting",
      blocks: [
        {
          type: "table",
          caption: "Conservative swap pairs (different indexes / methodologies)",
          headers: ["Asset Class", "Sell", "Replace With", "Then Optionally Swap Back"],
          rows: [
            [
              "US Large Cap",
              "SPY / IVV / VOO",
              "VTI (Total Market) or RSP (Equal Weight)",
              "After 31+ days",
            ],
            [
              "US Total Market",
              "VTI / ITOT",
              "SCHB or IWV (Russell 3000)",
              "After 31+ days",
            ],
            [
              "International Developed",
              "VEA / IEFA",
              "SCHF or VXUS (broader)",
              "After 31+ days",
            ],
            [
              "Emerging Markets",
              "VWO / IEMG",
              "SCHE or SPEM",
              "After 31+ days",
            ],
            [
              "US Aggregate Bonds",
              "BND / AGG",
              "SCHZ or VCSH (different duration)",
              "Often hold replacement",
            ],
            [
              "Short-Term Treasuries",
              "SHV / BIL",
              "SHY (slightly longer duration)",
              "After 31+ days",
            ],
          ],
        },
      ],
    },
    {
      id: "operational",
      heading: "Operational tips",
      blocks: [
        {
          type: "list",
          items: [
            "Turn off DRIP on positions where you may want to harvest losses.",
            "Audit auto-investment programs (401(k), HSA, robo-advisors) — these silently generate wash sales.",
            "Use HIFO or specific-ID lot selection at your broker; FIFO often realizes gains exactly when you don't want them.",
            "Track wash sales monthly, not at year-end — easier to recover and avoid IRA traps.",
            "If you elect §475(f) MTM (see Trader Tax Status guide), wash sales are exempted entirely. Big operational simplification.",
            "Brokers report wash sales on Form 1099-B per account only — they cannot see across accounts. Cross-account tracking is YOUR responsibility.",
          ],
        },
      ],
    },
    {
      id: "calculator-link",
      heading: "Run the impact",
      blocks: [
        {
          type: "calculator",
          calculator: "tax-loss-harvesting",
          caption: "See how losses flow against gains and ordinary income",
        },
      ],
    },
  ],
};

// ─── Quarterly Estimated Taxes for Traders ──────────────────────────────

const quarterlyEstimatedTaxes: Guide = {
  slug: "quarterly-estimated-taxes-for-traders",
  title: "Quarterly Estimated Taxes for Traders",
  topic: "tax",
  difficulty: "intermediate",
  summary:
    "When you owe estimated payments, safe-harbor rules, how to actually pay, and the withholding hack that's often easier.",
  readingMinutes: 9,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Required If", value: "Owe ≥ $1,000 at filing" },
    { label: "Q1 Due", value: "April 15" },
    { label: "Q2 Due", value: "June 15" },
    { label: "Q3 Due", value: "September 15" },
    { label: "Q4 Due", value: "January 15 (next year)" },
    { label: "Penalty Rate", value: "Federal short-term rate + 3% annualized" },
  ],
  sections: [
    {
      id: "who-must-pay",
      heading: "Who must pay quarterly estimates",
      blocks: [
        {
          type: "paragraph",
          text: "If you expect to owe at least $1,000 in federal tax after subtracting withholding and refundable credits, you must pay quarterly estimates — or be subject to §6654 underpayment penalties. Most active traders without substantial W-2 withholding fall into this bucket.",
        },
        {
          type: "list",
          items: [
            "Self-employed traders or anyone without W-2 income covering most of their tax.",
            "W-2 employees who additionally generate substantial trading gains, dividend income, or 1099 income their withholding doesn't cover.",
            "Retirees taking 401(k) / IRA withdrawals without elected withholding.",
            "Anyone running a side business, rental, or partnership with positive net income.",
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "W-2 withholding usually beats estimates",
          body: "If you have a day job, increasing your W-2 withholding is almost always easier than making quarterly estimates. Withholding is treated as paid evenly across the year regardless of when it was withheld, so a December bump can fix Q1-Q3 underpayment retroactively.",
        },
      ],
    },
    {
      id: "safe-harbor",
      heading: "The two safe-harbor paths",
      blocks: [
        {
          type: "paragraph",
          text: "You avoid the §6654 underpayment penalty if you meet EITHER safe harbor by year-end. Pick whichever is easier:",
        },
        {
          type: "table",
          caption: "Safe-harbor options",
          headers: ["Path", "Requirement", "When To Use"],
          rows: [
            [
              "90% rule",
              "Pay at least 90% of current-year total tax",
              "If current year is much lower than last year",
            ],
            [
              "100% / 110% prior-year rule",
              "Pay 100% of prior-year tax (110% if prior AGI > $150K)",
              "If current year is much HIGHER — pay last year's number, owe extra at filing without penalty",
            ],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Big trading year? Use prior-year safe harbor",
          body: "If you tripled last year's income, you don't have to estimate the new (huge) tax bill. Pay 110% of last year's tax in even quarterly chunks; you can owe $200K extra at filing with zero penalty. The IRS just wants you to be reasonably current, not perfect.",
        },
      ],
    },
    {
      id: "calculator-embed",
      heading: "Calculate your safe-harbor target",
      blocks: [
        {
          type: "calculator",
          calculator: "quarterly-tax-estimator",
          caption: "Estimate current-year tax and required Q4 payment",
        },
      ],
    },
    {
      id: "penalty-math",
      heading: "What the penalty actually costs",
      blocks: [
        {
          type: "paragraph",
          text: "The §6654 penalty is approximately the federal short-term interest rate + 3 percentage points, annualized, on the underpayment for the period it was outstanding. As of early 2026 that's roughly 8% annualized.",
        },
        {
          type: "key-value",
          caption: "Example penalty calculation",
          pairs: [
            { label: "Q1 underpayment", value: "$5,000 missed by April 15" },
            { label: "Made up at filing", value: "April 15 next year" },
            { label: "Days outstanding", value: "365" },
            { label: "Annualized rate", value: "~8%" },
            { label: "Approximate penalty", value: "~$400" },
          ],
        },
        {
          type: "paragraph",
          text: "Penalties are not deductible. They're not punitive in the criminal sense — just an interest charge. For traders the calculation is on each quarter's shortfall, calculated independently, so a Q1 miss is more expensive than a Q4 miss of the same dollar amount.",
        },
      ],
    },
    {
      id: "how-to-pay",
      heading: "How to actually make the payment",
      blocks: [
        {
          type: "list",
          items: [
            "EFTPS (Electronic Federal Tax Payment System): the IRS's free system. Free, scheduled, and reliable. One-time enrollment — DO IT NOW; the PIN comes by mail and takes a week.",
            "IRS Direct Pay: web-based, no enrollment, free for individuals. Pay from a bank account directly. Easiest if you don't pay frequently.",
            "Form 1040-ES voucher mailed with a check: works but slow and easy to misplace.",
            "Credit/debit card via approved processors: works but charges 1.85–2.50% — bad value for tax payments unless you're chasing card rewards.",
            "Withholding bump on W-2: easiest of all if you have a day job. File a new W-4 mid-year specifying additional withholding.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Set up EFTPS this week",
          body: "EFTPS lets you schedule payments months in advance, see history, and avoid USPS issues. The mail-in PIN process takes ~10 days, so do the enrollment now — even if you don't make a payment for months. You'll thank yourself the first time the deadline sneaks up.",
        },
      ],
    },
    {
      id: "deadlines",
      heading: "Deadlines (don't miss them)",
      blocks: [
        {
          type: "table",
          headers: ["Quarter", "Income Period Covered", "Payment Due"],
          rows: [
            ["Q1", "Jan 1 – Mar 31", "April 15"],
            ["Q2", "Apr 1 – May 31 (only 2 months)", "June 15"],
            ["Q3", "Jun 1 – Aug 31", "September 15"],
            ["Q4", "Sep 1 – Dec 31", "January 15 of next year"],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Q2 is two months, not three",
          body: "The IRS quarters are not equal. Q1 is 3 months, Q2 is 2 months (April-May), Q3 is 3 months (June-August), Q4 is 4 months. This trips up traders trying to compute &apos;earnings this quarter&apos; manually. The simpler approach: meet safe-harbor in equal quarterly amounts and ignore the timing irregularity.",
        },
      ],
    },
    {
      id: "state-coordination",
      heading: "State estimated taxes",
      blocks: [
        {
          type: "paragraph",
          text: "Most states with income tax also require estimated payments — separate from federal, separate due dates in some states, separate forms. Check your state's department of revenue site.",
        },
        {
          type: "list",
          items: [
            "California: similar quarterly schedule, can use FTB Web Pay.",
            "New York: similar schedule, IT-2105 form, can use NYS Online Services.",
            "No-income-tax states (FL, TX, WA, NV, AK, SD, WY, TN, NH): no state estimates required.",
            "Penalties at the state level vary — generally less harsh than federal but still worth avoiding.",
          ],
        },
      ],
    },
    {
      id: "annualized-income-method",
      heading: "Annualized Income Installment Method (advanced)",
      blocks: [
        {
          type: "paragraph",
          text: "If your trading income is highly seasonal — e.g., you make most of your money in Q4 — the standard equal-quarter assumption can overstate Q1-Q3 underpayment. Form 2210 Schedule AI lets you allocate income to the quarter actually earned.",
        },
        {
          type: "paragraph",
          text: "Trade-offs: more paperwork, but can substantially reduce penalty if your earnings cluster heavily in Q3-Q4. Most active traders skip this and just meet safe-harbor evenly; only worth the effort for genuinely lopsided years.",
        },
      ],
    },
    {
      id: "operational",
      heading: "Operational tips",
      blocks: [
        {
          type: "list",
          items: [
            "Set up EFTPS now, before you need it.",
            "Calendar all four due dates with a 5-day buffer for payment scheduling.",
            "Track YTD federal tax estimate monthly, not quarterly — gives you time to adjust.",
            "If your trading volume is going up rapidly mid-year, increase quarterly estimates immediately rather than waiting for the safe-harbor calculation to catch up.",
            "Keep a separate tax savings account funded automatically — pull from it for estimates so you're never scrambling for cash.",
            "Don't conflate estimated tax payments with self-employment tax (different calculation, also paid via 1040-ES line items).",
          ],
        },
      ],
    },
  ],
};

// ─── Estate Planning Basics ──────────────────────────────────────────────

const estatePlanningBasics: Guide = {
  slug: "estate-planning-basics",
  title: "Estate Planning Basics",
  topic: "estate",
  difficulty: "intermediate",
  summary:
    "Wills, beneficiary designations, the step-up trick, simple revocable trusts, and the four documents most adults actually need.",
  readingMinutes: 12,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Federal Estate Tax Exemption", value: "~$13.9M / $27.8M MFJ (2026)" },
    { label: "Step-Up in Basis", value: "Resets to FMV at death" },
    { label: "Beneficiary Designations", value: "Override the will" },
    { label: "Probate Bypass", value: "Trusts, TOD/POD, joint titling" },
    { label: "Most People Need", value: "Will + designations + POAs" },
    { label: "ILIT Lookback", value: "3 years" },
  ],
  sections: [
    {
      id: "the-four-docs",
      heading: "The four documents most adults actually need",
      blocks: [
        {
          type: "paragraph",
          text: "Estate planning sounds intimidating, but for most people the core deliverable is four simple documents. You can have all of them in place inexpensively (~$300–800 with a local attorney, or under $200 via online services for straightforward situations).",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Last Will and Testament — names guardians for minor children, names an executor, and distributes assets not governed by other mechanisms.",
            "Durable Power of Attorney (Financial) — designates someone to handle finances if you become incapacitated.",
            "Healthcare Power of Attorney / Advance Directive — designates someone to make medical decisions and states your preferences (DNR, ventilation, etc.).",
            "HIPAA Release — lets your designated agents access your medical records.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Most middle-class estates need ONLY these four",
          body: "Trusts get marketed aggressively, but for the vast majority of people they're overkill. A will plus updated beneficiary designations on retirement accounts and life insurance handles 90% of cases.",
        },
      ],
    },
    {
      id: "beneficiary-supremacy",
      heading: "Beneficiary designations override your will",
      blocks: [
        {
          type: "paragraph",
          text: "This is the single most-overlooked fact in estate planning. Retirement accounts (401(k), IRA, Roth IRA), life insurance, annuities, and TOD/POD-titled brokerage accounts pass directly to the named beneficiary at death — REGARDLESS of what your will says. Your will can leave 'everything to my spouse' but if your 401(k) still names your ex, the ex inherits the 401(k).",
        },
        {
          type: "list",
          items: [
            "Update beneficiaries after every major life event: marriage, divorce, kid born, death of a beneficiary.",
            "Most accounts allow primary AND contingent beneficiaries — use both. If your spouse predeceases you, contingent beneficiaries (kids, charity) take over without going through probate.",
            "Naming 'estate' as beneficiary is usually a mistake — forces probate and may accelerate income taxation on inherited retirement accounts.",
            "Beneficiary designations can specify per-stirpes (default in most contracts) or per-capita — be deliberate.",
          ],
        },
        {
          type: "callout",
          tone: "danger",
          title: "Common error: ex-spouse on retirement plan",
          body: "Following Kennedy v. DuPont (2009), employer plan beneficiary designations control even after divorce, even if state law would have revoked them. After every divorce: log into every account and update designations the same day.",
        },
      ],
    },
    {
      id: "step-up-basis",
      heading: "The step-up in basis (huge tax benefit)",
      blocks: [
        {
          type: "paragraph",
          text: "When someone dies owning appreciated assets (stocks, real estate, mutual funds), the cost basis 'steps up' to the fair market value at the date of death. Heirs can sell immediately with zero capital-gains tax on appreciation that occurred during the deceased's lifetime.",
        },
        {
          type: "key-value",
          caption: "Step-up example",
          pairs: [
            { label: "Parent buys stock 30 years ago", value: "$10,000 basis" },
            { label: "Stock worth at parent's death", value: "$200,000" },
            { label: "Embedded gain", value: "$190,000" },
            { label: "Heir's new basis (stepped-up)", value: "$200,000" },
            { label: "Heir sells for $205,000", value: "Owes tax on $5,000 (NOT $195,000)" },
            { label: "Tax savings", value: "$28,500+ on this one position" },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Strategic implication: don't sell appreciated assets late in life",
          body: "Holding highly appreciated positions until death lets your heirs receive them with zero embedded tax liability. This is one reason elderly investors are reluctant to sell winners — and it's a defensible strategy if their estate is below the federal exemption.",
        },
        {
          type: "paragraph",
          text: "Note: step-up doesn't apply to retirement accounts. Inherited 401(k)s and traditional IRAs come with the deceased's full embedded tax liability. Roth IRAs come tax-free either way. Step-up is most powerful for taxable brokerage accounts and real estate.",
        },
      ],
    },
    {
      id: "probate",
      heading: "Probate — what it is and how to bypass it",
      blocks: [
        {
          type: "paragraph",
          text: "Probate is the court process of validating a will, paying creditors, and distributing assets. It's slow (6-18 months in most states), public (the will and inventory become public record), and costly (3-7% of estate value in attorney and court fees, depending on state).",
        },
        {
          type: "paragraph",
          text: "Several mechanisms bypass probate entirely:",
        },
        {
          type: "table",
          headers: ["Mechanism", "What It Does", "Cost"],
          rows: [
            [
              "Beneficiary designations",
              "Retirement, life insurance, annuities pass directly",
              "Free",
            ],
            [
              "TOD / POD",
              "Brokerage and bank accounts pass directly",
              "Free at most institutions",
            ],
            [
              "Joint Tenancy with Right of Survivorship (JTWROS)",
              "Real estate / accounts pass to surviving co-owner",
              "Free, but loses partial step-up; ownership shared during life",
            ],
            [
              "Revocable Living Trust",
              "Assets titled to the trust pass per trust terms",
              "$1,500–3,500 to set up; assets need re-titling",
            ],
            [
              "Tenancy by the Entirety (married couples in some states)",
              "Real estate passes automatically + creditor protection",
              "Free in eligible states",
            ],
          ],
        },
      ],
    },
    {
      id: "trusts",
      heading: "When you might actually need a trust",
      blocks: [
        {
          type: "paragraph",
          text: "Revocable living trusts are sold aggressively — they sound sophisticated and let attorneys charge more. Real use cases are narrower:",
        },
        {
          type: "list",
          items: [
            "Real estate in MULTIPLE states — avoids ancillary probate in each state.",
            "Privacy concerns — wills become public record at probate; trust contents stay private.",
            "Incapacity planning beyond a POA — trusts can specify management during disability without court intervention.",
            "Large estates approaching the federal exemption ($13.9M / person in 2026, $27.8M for couples) — need trust planning to capture both spouses' exemptions and minimize estate tax.",
            "Special-needs beneficiaries — special-needs trusts preserve eligibility for means-tested government benefits.",
            "Spendthrift beneficiaries — trusts can control distribution timing for heirs who'd blow a lump sum.",
            "Second marriages with children from prior relationships — provide for current spouse during life, then direct remainder to original kids.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Funding the trust matters",
          body: "Setting up a revocable trust without re-titling assets to the trust is the most common error. Untitled assets still go through probate. Your attorney should walk you through funding (re-titling deeds, transferring brokerage accounts) — and you have to actually do it.",
        },
      ],
    },
    {
      id: "ilit",
      heading: "ILIT for high-net-worth with permanent insurance",
      blocks: [
        {
          type: "paragraph",
          text: "If you have permanent life insurance AND a taxable estate (above ~$13.9M / individual), an Irrevocable Life Insurance Trust (ILIT) keeps the policy proceeds out of your estate while still letting them benefit your heirs.",
        },
        {
          type: "paragraph",
          text: "Mechanics: the trust owns the policy; you pay premiums via 'gifts' to the trust (using Crummey withdrawal rights to qualify for annual gift-tax exclusion); when you die, the trust receives the death benefit outside your estate.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "Three-year lookback",
          body: "Transferring an EXISTING policy to an ILIT pulls it back into your estate if you die within 3 years (§2035). To avoid: have the ILIT purchase a NEW policy from day one. Don't transfer existing policies into ILITs unless you have certainty of 3+ years.",
        },
      ],
    },
    {
      id: "guardianship",
      heading: "Guardianship for minor children",
      blocks: [
        {
          type: "paragraph",
          text: "If you have minor children, designating a guardian in your will is non-negotiable. Without it, the courts decide — and the courts may not pick whom you'd have chosen. The choice is hard (split custody between extended family? best parents vs. closest geography?), but having ANY designation beats having none.",
        },
        {
          type: "list",
          items: [
            "Discuss with the prospective guardian first — surprise designations are unfair to all parties.",
            "Name backup guardians in case the primary is unavailable or declines.",
            "Consider separating financial guardianship (manages money) from physical guardianship (raises kids) — the right person for one isn't always right for both.",
            "Set up a testamentary trust in the will to manage assets for minors until they reach a chosen age (usually 25-30, not 18 — most 18-year-olds shouldn't get a lump sum).",
          ],
        },
      ],
    },
    {
      id: "common-mistakes",
      heading: "Common mistakes",
      blocks: [
        {
          type: "list",
          items: [
            "Never updating beneficiary designations after divorce, marriage, or birth.",
            "Naming 'my estate' as beneficiary on retirement accounts (forces probate, accelerates taxation).",
            "Using JTWROS with adult children to avoid probate — exposes the asset to the child's creditors and divorce, and forfeits step-up basis.",
            "Setting up a revocable trust and never re-titling assets into it.",
            "Treating an inheritance pre-tax as if it's spendable — withhold for taxes first.",
            "DIY-ing estate plans for blended families, business ownership, or estates over $5M — these need professional drafting.",
            "Hiding documents in a safe deposit box that requires a court order to open.",
            "Failing to communicate plans — heirs surprised by terms often dispute them.",
          ],
        },
      ],
    },
    {
      id: "where-to-store",
      heading: "Where to keep documents",
      blocks: [
        {
          type: "list",
          items: [
            "Original will: at home in a fire-safe, OR with the attorney who drafted it. Some states allow lodging it with the probate court for a small fee.",
            "Copies: with executor + healthcare agent + adult children.",
            "Digital copies: in encrypted password manager (1Password, Bitwarden) accessible to spouse / executor.",
            "Asset inventory + account list: separate document, kept current. List of accounts, login locations, beneficiaries, and approximate values. The executor's life is much easier with this.",
            "Crypto: explicit instructions for keys/seed phrases; otherwise often permanently lost at death.",
          ],
        },
      ],
    },
    {
      id: "review-cadence",
      heading: "Review cadence",
      blocks: [
        {
          type: "list",
          items: [
            "Major life events trigger immediate review: marriage, divorce, birth, adoption, death of beneficiary, move to a new state.",
            "Otherwise: every 3-5 years — laws change, tax exemptions change, family situations evolve.",
            "Don't wait for the &quot;perfect&quot; plan — having basic documents in place at 30 beats having sophisticated documents finally drafted at 65 after a heart attack.",
          ],
        },
      ],
    },
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────

export const GUIDES: Guide[] = [
  rothIra,
  hsaStealth,
  fivetwonine,
  permanentLife,
  orderOfOperations,
  backdoorRoth,
  termLife,
  traderTaxMtm,
  washSaleDeepDive,
  quarterlyEstimatedTaxes,
  estatePlanningBasics,
];

export function getGuideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function getGuidesByTopic(topic: GuideTopic): Guide[] {
  return GUIDES.filter((g) => g.topic === topic);
}

// Re-export for convenience in components
export type { ReactNode };
