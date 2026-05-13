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

// ─── Roth Conversion Ladder ──────────────────────────────────────────────

const rothConversionLadder: Guide = {
  slug: "roth-conversion-ladder",
  title: "The Roth Conversion Ladder for Early Retirement",
  topic: "retirement",
  difficulty: "advanced",
  summary:
    "The strategy that lets early retirees access traditional retirement money before 59½ — without penalties.",
  readingMinutes: 11,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Conversion 5-Year Clock", value: "Each conversion has its own" },
    { label: "Early Access Age", value: "55+ (with 5-year ladder lead)" },
    { label: "Tax Owed at Conversion", value: "Ordinary income on converted amount" },
    { label: "Best Filling Years", value: "Low-income gap years" },
    { label: "Bracket-Fill Target", value: "Top of 12% / 22% bracket" },
    { label: "Pairs With", value: "Brokerage bridge + delayed Soc Sec" },
  ],
  sections: [
    {
      id: "the-problem",
      heading: "The early-retirement bridge problem",
      blocks: [
        {
          type: "paragraph",
          text: "If you've been a diligent retirement saver, by your 50s most of your wealth is locked in pre-tax 401(k) and IRA accounts. Pulling from them before 59½ triggers a 10% penalty plus ordinary income tax. If you want to retire at 50, you have a 9.5-year gap to bridge.",
        },
        {
          type: "paragraph",
          text: "The Roth Conversion Ladder solves this elegantly: it lets you 'pre-pay' tax on chunks of your traditional retirement money during low-income years, and after a 5-year clock the converted principal becomes available penalty-free.",
        },
      ],
    },
    {
      id: "the-mechanics",
      heading: "The mechanics",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "In your first low-income year (often the year after you stop working), convert a chunk of your Traditional IRA to a Roth IRA. Pay ordinary income tax on the converted amount.",
            "Repeat each year, sized to fill up your low brackets.",
            "After 5 calendar years, the FIRST conversion's principal becomes withdrawable from the Roth — penalty-free, regardless of age.",
            "Each subsequent year unlocks the conversion you did 5 years prior.",
            "The earnings on those converted dollars stay locked until 59½ + the standard Roth 5-year rule for tax-free earnings.",
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Why &apos;ladder&apos;",
          body: "Each year's conversion is a rung. The bottom rung (year 1's conversion) becomes available 5 years later, then year 2's becomes available year 6, and so on. By staggering them you build a continuous income stream of penalty-free withdrawals.",
        },
      ],
    },
    {
      id: "worked-example",
      heading: "Worked example",
      blocks: [
        {
          type: "paragraph",
          text: "Sarah retires at 50 with $1.5M in a Traditional IRA and $300K in a taxable brokerage. She wants to retire fully but needs $60K/yr to live on.",
        },
        {
          type: "table",
          caption: "Sarah's 10-year ladder",
          headers: ["Year", "Age", "Spending Source", "Roth Conversion", "Roth Withdrawal"],
          rows: [
            ["2026", "50", "Brokerage", "$60K (fills 12% bracket)", "—"],
            ["2027", "51", "Brokerage", "$60K", "—"],
            ["2028", "52", "Brokerage", "$60K", "—"],
            ["2029", "53", "Brokerage", "$60K", "—"],
            ["2030", "54", "Brokerage", "$60K", "—"],
            ["2031", "55", "Roth withdrawal", "$60K", "$60K (2026 conversion)"],
            ["2032", "56", "Roth withdrawal", "$60K", "$60K (2027 conversion)"],
            ["2033", "57", "Roth withdrawal", "$60K", "$60K (2028 conversion)"],
            ["2034", "58", "Roth withdrawal", "$60K", "$60K (2029 conversion)"],
            ["2035", "59½", "Bridge to age 60", "$60K", "$60K (2030 conversion)"],
            ["2036+", "60+", "Anything (after 59½)", "—", "—"],
          ],
        },
        {
          type: "paragraph",
          text: "The brokerage funds Sarah's first 5 years (low capital-gains rates due to low income). Starting year 6, the converted principal flows out tax-free as Roth withdrawals. By year 11, she's past 59½ and can withdraw freely from any account.",
        },
      ],
    },
    {
      id: "tax-on-conversions",
      heading: "Tax on the conversions",
      blocks: [
        {
          type: "paragraph",
          text: "Each conversion is taxable income in the year you make it. The whole point of the strategy is that you do conversions during YEARS WHERE YOUR OTHER INCOME IS LOW — so the conversion fills up the low brackets, not the high ones.",
        },
        {
          type: "table",
          caption: "Strategic bracket-fill targets (2026 single filer)",
          headers: ["Bracket", "Top of Bracket", "Common Strategy"],
          rows: [
            ["12%", "$48,475", "Aggressive low-bracket fill — convert until you hit the top"],
            ["22%", "$103,350", "Moderate fill if your spending requires more income"],
            ["24%", "$197,300", "Defensive — only if you'd otherwise hit IRMAA later"],
            ["32%", "$250,525", "Generally too expensive; let the IRA continue compounding"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Don&apos;t miss the 0% LTCG bracket",
          body: "If your only income is conversions + a bit of taxable-brokerage capital gains, gains up to ~$48K (single) are taxed at 0%. Coordinating conversions with brokerage withdrawals can produce stretches of effectively 0% federal tax. This is the FIRE community&apos;s favorite trick.",
        },
      ],
    },
    {
      id: "calculator",
      heading: "Run your numbers",
      blocks: [
        {
          type: "calculator",
          calculator: "fire-number",
          caption: "Project the bridge: see how long taxable + Roth principal can fund early retirement",
        },
      ],
    },
    {
      id: "rule-72t-alternative",
      heading: "Rule 72(t) — the alternative path",
      blocks: [
        {
          type: "paragraph",
          text: "If you can&apos;t afford a 5-year delay, IRC §72(t) lets you take Substantially Equal Periodic Payments (SEPP) from a Traditional IRA before 59½ without the 10% penalty. You commit to a fixed annual amount (calculated by IRS formula) for at least 5 years OR until 59½, whichever is later.",
        },
        {
          type: "list",
          items: [
            "Locks you in: stopping or modifying the schedule retroactively imposes the 10% penalty on all prior payments.",
            "Calculation methods: required minimum distribution method (lowest), fixed amortization, fixed annuitization. Most flexible: switch from amortization to RMD method once.",
            "Better than the ladder when: you can&apos;t afford the 5-year wait, your taxable balance is too small to bridge, or you have only IRAs (no brokerage).",
            "Worse when: you have flexibility — the ladder gives more control over annual amounts.",
          ],
        },
      ],
    },
    {
      id: "common-pitfalls",
      heading: "Common pitfalls",
      blocks: [
        {
          type: "list",
          items: [
            "Forgetting the 5-year clock starts JANUARY 1 of the conversion year, regardless of when in the year you converted.",
            "Pro-rata trap: if you have non-deductible basis in the IRA, conversions are partially tax-free. Track via Form 8606.",
            "ACA subsidies: conversions count as income and can blow up your subsidy. Coordinate carefully if you&apos;re using ACA marketplace insurance.",
            "IRMAA: large conversions in your 60s can trigger Medicare surcharges 2 years later (Part B/D).",
            "State tax: most states tax conversions; some (PA) don&apos;t. Plan accordingly.",
            "Sequence risk: a market crash in year 1 of retirement amplifies — converting at depressed values is good (tax less), but withdrawing converted principal at depressed values is bad.",
          ],
        },
      ],
    },
    {
      id: "when-it-fits",
      heading: "When this strategy fits",
      blocks: [
        {
          type: "list",
          items: [
            "FIRE retirees with mostly traditional retirement money and 5+ years to bridge.",
            "Anyone retiring before 59½ with substantial pre-tax balances.",
            "People expecting low-income years (sabbatical, education, business pivot).",
            "Households planning to delay Social Security to 70 — conversions through age 70 fill low brackets cheaply.",
            "Estate planners — Roth assets pass to heirs tax-free; conversions reduce future estate tax exposure.",
          ],
        },
      ],
    },
    {
      id: "when-it-doesnt",
      heading: "When NOT to use it",
      blocks: [
        {
          type: "list",
          items: [
            "Retirees who&apos;ll consistently be in a HIGHER bracket post-retirement — pay the tax later instead.",
            "People expecting to relocate to a no-income-tax state — wait until you move.",
            "Anyone with health-event-driven medical deductions in the conversion year — those would shelter ordinary income better than conversion would utilize.",
            "Already in your 60s with no real bridge problem — just take traditional withdrawals.",
          ],
        },
      ],
    },
  ],
};

// ─── Asset Location ──────────────────────────────────────────────────────

const assetLocation: Guide = {
  slug: "asset-location-strategy",
  title: "Asset Location: Putting the Right Asset in the Right Account",
  topic: "tax",
  difficulty: "intermediate",
  summary:
    "Same portfolio, different tax outcomes — placing tax-inefficient assets in tax-advantaged accounts can boost after-tax returns by 30-100 bps/year.",
  readingMinutes: 9,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Annual Tax Drag Saved", value: "30–100 bps typical" },
    { label: "Best Spot for Bonds", value: "Traditional 401(k) / IRA" },
    { label: "Best Spot for High-Growth", value: "Roth IRA" },
    { label: "Best Spot for Index Funds", value: "Taxable brokerage" },
    { label: "REITs", value: "Tax-deferred (high ordinary div)" },
    { label: "Active / High-Turnover", value: "Tax-deferred" },
  ],
  sections: [
    {
      id: "the-idea",
      heading: "The idea in one paragraph",
      blocks: [
        {
          type: "paragraph",
          text: "Different account types tax different income streams differently. Bonds yield ordinary-income interest. Index funds throw off mostly qualified dividends and long-term gains. REITs pay non-qualified dividends. By matching each asset class to its tax-optimal account, you keep more of the same gross return.",
        },
        {
          type: "callout",
          tone: "info",
          title: "Asset allocation vs asset location",
          body: "Allocation = how much of each asset class you hold. Location = which account each asset class lives in. They&apos;re separate decisions, both worth optimizing.",
        },
      ],
    },
    {
      id: "the-three-buckets",
      heading: "The three account types",
      blocks: [
        {
          type: "table",
          headers: ["Account", "Tax Treatment", "What Goes Here"],
          rows: [
            [
              "Tax-deferred (Traditional 401(k), IRA)",
              "Withdrawals taxed as ordinary income",
              "Bonds, REITs, high-turnover funds, active managers",
            ],
            [
              "Tax-free (Roth IRA, Roth 401(k))",
              "All future growth is tax-free",
              "Highest expected-return assets — small caps, emerging markets, aggressive growth",
            ],
            [
              "Taxable brokerage",
              "Dividends and gains taxed annually",
              "Tax-efficient broad index ETFs (VTI, VXUS), municipal bonds, individual stocks held long-term",
            ],
          ],
        },
      ],
    },
    {
      id: "why-bonds-tax-deferred",
      heading: "Why bonds belong in tax-deferred",
      blocks: [
        {
          type: "paragraph",
          text: "A 5%-yielding bond fund in a taxable account is taxed at your ordinary rate — say 24%. That&apos;s a 1.2 percentage point annual tax drag. The same bond in a Traditional IRA is tax-free until withdrawal, and even then taxed at your retirement bracket (likely lower).",
        },
        {
          type: "key-value",
          caption: "Bond drag comparison ($100K @ 5% yield)",
          pairs: [
            { label: "Bonds in taxable (24% bracket)", value: "$5,000 yield → $1,200 tax = $3,800 after-tax" },
            { label: "Bonds in Traditional IRA (24% future)", value: "$5,000 yield deferred. After 20 years compounded, withdraw — tax on much smaller per-year basis" },
            { label: "Bonds in Roth IRA", value: "$5,000 yield tax-free forever — but Roth space is precious; better assets exist for it" },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "But what if your portfolio is mostly taxable?",
          body: "If you have $1M taxable + $50K IRA, you can&apos;t fit your bond allocation in the IRA. In that case use municipal bonds in taxable (federally tax-free) — they yield less but the after-tax math is often comparable.",
        },
      ],
    },
    {
      id: "why-growth-in-roth",
      heading: "Why high-growth assets belong in Roth",
      blocks: [
        {
          type: "paragraph",
          text: "Roth space is the most valuable real estate in your portfolio — every dollar of growth there is tax-free forever, with no RMDs. Put your highest-expected-return assets there to maximize that value.",
        },
        {
          type: "list",
          items: [
            "Small-cap stocks (higher long-run expected return, more volatile).",
            "Emerging markets (higher expected return, FX volatility).",
            "Aggressive growth tilts (factor: small/value).",
            "Avoid: bonds in Roth — wastes the tax-free wrapper on a low-return asset.",
            "Avoid: REITs in Roth — dividends are non-qualified anyway, so Roth&apos;s tax-free dividend benefit doesn&apos;t add much.",
          ],
        },
      ],
    },
    {
      id: "why-indexes-taxable",
      heading: "Why broad index funds belong in taxable",
      blocks: [
        {
          type: "paragraph",
          text: "Broad index funds (VTI, VXUS, VOO) are inherently tax-efficient: low turnover means few capital-gains distributions, dividends are mostly qualified (15-20% rate), and step-up basis at death wipes out embedded gains.",
        },
        {
          type: "list",
          items: [
            "VTI distributes ~1.5% in qualified dividends annually — taxed at 15% = ~22 bps drag.",
            "Same VTI in Traditional IRA: dividend is tax-deferred, but withdrawal is at ordinary income rates (24%+) — net WORSE outcome long-term for low-yield index funds.",
            "Step-up basis means you can hold appreciated VTI for life, leave it to heirs, basis resets, never paid the capital gains.",
            "Tax-loss harvesting opportunities exist in taxable but not in IRAs.",
          ],
        },
      ],
    },
    {
      id: "the-math",
      heading: "The math: what asset location is worth",
      blocks: [
        {
          type: "paragraph",
          text: "Studies (Vanguard, Morningstar) put the after-tax benefit of optimal asset location at 30–100 basis points per year for typical investors. Compounded over 30 years, that&apos;s the difference between $1M and $1.4M.",
        },
        {
          type: "table",
          caption: "Typical drag improvement from asset location",
          headers: ["Asset Mix", "Wrong Location Drag", "Optimal Location Drag", "30-yr Effect on $500K"],
          rows: [
            ["80/20 stocks/bonds", "1.2% / yr", "0.4% / yr", "+$280K"],
            ["60/40 with REITs", "1.5% / yr", "0.5% / yr", "+$345K"],
            ["High-yield bonds heavy", "2.0% / yr", "0.6% / yr", "+$430K"],
          ],
        },
      ],
    },
    {
      id: "execution",
      heading: "How to actually execute",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Set total target asset allocation across all accounts combined (e.g., 80% stocks / 20% bonds).",
            "List your accounts by tax type: tax-deferred, Roth, taxable.",
            "Place tax-INefficient holdings (bonds, REITs) FIRST in tax-deferred accounts until they&apos;re full.",
            "Place highest-expected-return holdings in Roth (growth, small-cap, emerging markets).",
            "Fill the remaining tax-deferred space with whatever&apos;s left.",
            "Use broad index ETFs for taxable.",
            "Rebalance ACROSS ACCOUNTS, not within — sell overweighted in tax-deferred (no tax hit) instead of triggering capital gains in taxable.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Don&apos;t let tax tail wag investment dog",
          body: "If your asset location forces you into a portfolio you wouldn&apos;t otherwise hold (e.g., 100% bonds in tax-deferred just because it fits), you&apos;ve over-optimized. Allocation comes first; location is a refinement, not a constraint.",
        },
      ],
    },
    {
      id: "edge-cases",
      heading: "Edge cases",
      blocks: [
        {
          type: "list",
          items: [
            "Mostly Roth (high earner with mega-backdoor): the asset-location benefit shrinks because tax differences disappear. Just pick a sensible allocation.",
            "Inherited IRA: pulls 10-year withdrawal requirement; preferentially hold lower-growth assets to minimize forced taxable withdrawals.",
            "Annuities: fixed annuities resemble bonds; same tax-deferral analysis, different fee structure.",
            "Crypto: taxable brokerage analog if held in self-custody. Roth crypto IRA exists but high fees usually defeat the tax benefit.",
            "Direct real estate (rental property): substantial depreciation deductions; inherently tax-advantaged; doesn&apos;t benefit from being in a tax-deferred account.",
          ],
        },
      ],
    },
  ],
};

// ─── Social Security Claiming Strategies ───────────────────────────────

const socialSecurityClaiming: Guide = {
  slug: "social-security-claiming-strategies",
  title: "Social Security Claiming Strategies",
  topic: "retirement",
  difficulty: "intermediate",
  summary:
    "When to claim, why 70 is usually right, spousal and survivor benefits, and how taxes interact with conversions.",
  readingMinutes: 11,
  lastReviewed: "2026-05-01",
  keyFacts: [
    { label: "Earliest Claiming Age", value: "62" },
    { label: "Full Retirement Age (FRA)", value: "67 (born 1960+)" },
    { label: "Latest Claiming Age", value: "70" },
    { label: "Delayed Credit", value: "+8% / year past FRA" },
    { label: "Early-Claiming Reduction", value: "−6.67% / yr first 3, −5% after" },
    { label: "Break-Even Age", value: "~80 (claiming 70 vs 62)" },
  ],
  sections: [
    {
      id: "the-basics",
      heading: "The basics",
      blocks: [
        {
          type: "paragraph",
          text: "Social Security pays benefits based on your top 35 years of earnings. Your Primary Insurance Amount (PIA) is the benefit you&apos;d receive at your Full Retirement Age (FRA). Claiming before FRA reduces it; claiming after increases it.",
        },
        {
          type: "table",
          caption: "Benefit amounts as a percentage of your PIA",
          headers: ["Claim Age", "% of PIA", "Notes"],
          rows: [
            ["62", "70%", "Earliest possible — 30% reduction"],
            ["63", "75%", "Reduced"],
            ["64", "80%", "Reduced"],
            ["65", "86.7%", "Reduced"],
            ["66", "93.3%", "Reduced"],
            ["67 (FRA)", "100%", "Full benefit"],
            ["68", "108%", "Delayed credit (+8%/yr)"],
            ["69", "116%", "Delayed credit"],
            ["70", "124%", "Maximum benefit — no further increase"],
          ],
        },
      ],
    },
    {
      id: "why-70",
      heading: "Why claiming at 70 usually wins",
      blocks: [
        {
          type: "paragraph",
          text: "The +8% per year delayed credit between 67 and 70 is GUARANTEED, COLA-adjusted, and lasts your lifetime. There&apos;s no other risk-free 8% return available. For anyone with reasonable longevity expectations and the means to delay, 70 is mathematically optimal.",
        },
        {
          type: "list",
          items: [
            "Break-even age (cumulative benefits at 70 catch up to those who claimed at 62): ~age 80.",
            "Average life expectancy at 65: 84 (men) / 87 (women) — both well past 80.",
            "Spousal survivor benefits inherit the higher earner&apos;s benefit — delaying helps the surviving spouse too.",
            "Inflation-adjusted (COLA) — protects against decades of inflation that fixed pensions don&apos;t.",
            "Tax-advantaged — only 50–85% of SS is taxable depending on other income.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Think of it as longevity insurance",
          body: "Social Security at 70 is the cheapest insurance against living to 95 you can buy. The downside (claim at 70, die at 72) costs your heirs nothing — they get nothing either way. The upside (live to 95, get 33 years of inflation-adjusted income) is enormous.",
        },
      ],
    },
    {
      id: "when-to-claim-early",
      heading: "When to claim early (62)",
      blocks: [
        {
          type: "list",
          items: [
            "You need the income immediately and have no other source.",
            "Serious health issue with reduced life expectancy — claim early, capture more total benefits before death.",
            "You qualify for spousal benefits and your spouse has already filed — coordinate claiming.",
            "You&apos;re a low-earner spouse and waiting won&apos;t materially increase your survivor benefit.",
            "Specific scenario: your higher-earner spouse already claimed early, and you can claim a spousal benefit now to provide income while letting your own benefit grow.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Earnings test if claiming before FRA",
          body: "If you claim before FRA and continue earning above ~$23K/yr (2026), benefits are reduced $1 for every $2 over the limit. The reduction is recouped after FRA, but cash-flow impact is real.",
        },
      ],
    },
    {
      id: "spousal-survivor",
      heading: "Spousal & survivor benefits",
      blocks: [
        {
          type: "paragraph",
          text: "The lower-earning spouse can claim 50% of the higher earner&apos;s PIA at FRA (less if claiming before). This is a separate benefit — the lower earner can also claim their own benefit if larger.",
        },
        {
          type: "list",
          items: [
            "Spousal benefit caps at 50% of partner&apos;s PIA — delaying past FRA does NOT increase spousal benefits.",
            "Survivor benefit is the FULL amount the deceased was receiving (or would have received). Includes delayed credits.",
            "Strategy implication: in mixed-age couples, the higher-earner often delays to 70 to maximize the survivor benefit, while the lower-earner claims earlier.",
            "Divorced spouses (10+ year marriage, currently unmarried) qualify for spousal benefit on ex&apos;s record — doesn&apos;t reduce ex&apos;s benefit.",
            "Children under 18 (or 19 if still in HS) of a retiring or deceased worker may qualify for child benefits.",
          ],
        },
      ],
    },
    {
      id: "tax-interaction",
      heading: "Taxes & coordinating with retirement income",
      blocks: [
        {
          type: "paragraph",
          text: "Up to 85% of SS benefits are taxable depending on your &apos;combined income&apos; (AGI + tax-exempt interest + 50% of SS). High-income retirees pay tax on the maximum 85% of SS regardless of source.",
        },
        {
          type: "table",
          caption: "Combined income thresholds (2026, single filer)",
          headers: ["Combined Income", "% of SS Taxable"],
          rows: [
            ["< $25,000", "0%"],
            ["$25,000 – $34,000", "Up to 50%"],
            ["> $34,000", "Up to 85%"],
          ],
          align: ["right", "right"],
        },
        {
          type: "callout",
          tone: "tip",
          title: "The Roth conversion synergy",
          body: "Roth withdrawals are NOT included in combined income for SS taxation. Doing Roth conversions BEFORE claiming Social Security (typically ages 60–69) lets you fill low brackets cheaply AND reduces future SS taxation.",
        },
      ],
    },
    {
      id: "irmaa",
      heading: "IRMAA — the Medicare surcharge no one warns you about",
      blocks: [
        {
          type: "paragraph",
          text: "Medicare premiums (Part B + Part D) are means-tested. Above certain MAGI thresholds, you pay surcharges called IRMAA — sometimes 3–5× the base premium. The lookback is 2 years, so 2026 IRMAA depends on 2024 MAGI.",
        },
        {
          type: "key-value",
          caption: "2026 IRMAA thresholds (single filer, illustrative)",
          pairs: [
            { label: "MAGI ≤ $103K", value: "Standard Part B premium" },
            { label: "$103K – $129K", value: "+$70/month surcharge" },
            { label: "$129K – $161K", value: "+$176/month" },
            { label: "$161K – $193K", value: "+$281/month" },
            { label: "> $500K", value: "+$447/month" },
          ],
        },
        {
          type: "paragraph",
          text: "Implication: a single Roth conversion that pushes 2024 MAGI just over a threshold costs you ~$1,000+/yr in 2026 Medicare premiums. Plan around the brackets when converting. Special Form SSA-44 lets you appeal IRMAA after a life event (retirement, work stoppage, divorce, death of spouse).",
        },
      ],
    },
    {
      id: "common-pitfalls",
      heading: "Common pitfalls",
      blocks: [
        {
          type: "list",
          items: [
            "Claiming early because &apos;Social Security might run out&apos; — projections show even worst-case scenarios pay 75-80% of benefits indefinitely.",
            "Not coordinating between spouses — leaves money on the table.",
            "Missing the divorced-spouse benefit (10+ year marriage required).",
            "Failing to suspend benefits at FRA when earning above the limit (incurs penalty).",
            "Triggering IRMAA via uncoordinated Roth conversions — cost can exceed conversion savings.",
            "Believing &apos;you can&apos;t take it with you&apos; for retirees who can comfortably delay — you&apos;re leaving INFLATION-ADJUSTED LIFETIME income on the table for a likely 10+ years of higher payments.",
          ],
        },
      ],
    },
    {
      id: "decision-framework",
      heading: "Quick decision framework",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Are you in poor health? → Claim early (62-FRA). Otherwise continue.",
            "Need the income to pay bills? → Claim when needed. Otherwise continue.",
            "Single, healthy, decent longevity expectation? → Delay to 70.",
            "Married, you are higher earner? → Delay to 70 (maximizes survivor benefit).",
            "Married, you are lower earner? → File for spousal at FRA (or earlier if needed); your own benefit doesn&apos;t need to delay past FRA.",
            "Doing Roth conversions? → Convert ages 60-69 to fill low brackets, then claim SS at 70.",
          ],
        },
      ],
    },
  ],
};

// ═══ Guides for minors / custodial investing ═══════════════════════════════

const ugmaUtma: Guide = {
  slug: "ugma-utma-custodial-accounts",
  title: "UGMA & UTMA: Custodial Accounts for Minors",
  topic: "education-funding",
  difficulty: "intro",
  summary:
    "How custodial accounts work, the difference between UGMA and UTMA, when the kid takes control, and the FAFSA cost most people don't know about.",
  readingMinutes: 9,
  lastReviewed: "2026-05-13",
  keyFacts: [
    { label: "Account Type", value: "Custodial — minor owns, adult manages" },
    { label: "Annual Limit", value: "None (but gift tax: $19K/donor/year in 2026)" },
    { label: "Age of Termination", value: "18, 21, or 25 — varies by state" },
    { label: "Tax Treatment", value: "Subject to Kiddie Tax (see separate guide)" },
    { label: "FAFSA Impact", value: "Counts as STUDENT asset — assessed at 20%" },
    { label: "Reversibility", value: "Irrevocable — you cannot take the money back" },
  ],
  sections: [
    {
      id: "what-they-are",
      heading: "What custodial accounts actually are",
      blocks: [
        {
          type: "paragraph",
          text: "A custodial account is a brokerage account that legally belongs to a minor but is managed by an adult custodian (usually a parent or grandparent) until the minor reaches the age of termination. UGMA and UTMA are the two state-law frameworks that govern these accounts in the US.",
        },
        {
          type: "paragraph",
          text: "The key thing to internalize before opening one: the money is the child's the moment you transfer it in. You're not 'saving for them' — you're giving them money and managing it on their behalf. When they hit the age of termination, the account converts to their full control. You cannot take it back, redirect it, or hold it hostage if they want to spend it on a sports car instead of college.",
        },
        {
          type: "callout",
          tone: "danger",
          title: "Irrevocability is the part everyone underestimates",
          body: "Custodial accounts are common because they're easy. They're easy because they have very few protections for the donor. If your relationship with your child sours, if they make decisions you disagree with, or if they file for bankruptcy at 22 — the account is theirs. Not yours. There is no clawback.",
        },
      ],
    },
    {
      id: "ugma-vs-utma",
      heading: "UGMA vs UTMA — what actually differs",
      blocks: [
        {
          type: "paragraph",
          text: "UGMA (Uniform Gifts to Minors Act, 1956) was the original framework. UTMA (Uniform Transfers to Minors Act, 1986) is the more modern version that most states now use. South Carolina and Vermont are the last UGMA-only states; everyone else offers UTMA.",
        },
        {
          type: "table",
          caption: "UGMA vs UTMA at a glance",
          headers: ["Feature", "UGMA", "UTMA"],
          rows: [
            ["Year enacted", "1956", "1986"],
            ["Assets allowed", "Cash, stocks, bonds, mutual funds only", "Anything — real estate, art, intellectual property, etc."],
            ["Age of termination", "Usually 18", "18, 21, or 25 depending on state"],
            ["Available in", "All states (legacy)", "All states except SC and VT"],
          ],
          align: ["left", "left", "left"],
        },
        {
          type: "paragraph",
          text: "For pure brokerage-account use, the two are functionally identical. If you're holding stocks, bonds, ETFs, and mutual funds — which is 99% of custodial accounts in the wild — UGMA and UTMA behave the same way. The UTMA advantages (broader assets, higher age of termination in some states) matter only if you're transferring property other than securities.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Most brokerages just call them all 'UTMA' now",
          body: "Fidelity, Schwab, Vanguard, etc. typically open UTMAs by default (or UGMAs in SC/VT). You don't have to pick — they handle the state law for you. The defaults are sensible.",
        },
      ],
    },
    {
      id: "age-of-termination",
      heading: "When does the kid take control?",
      blocks: [
        {
          type: "paragraph",
          text: "This is the single most important variable for parents to understand. The age at which the account converts to the minor's full control is set by your state's UTMA statute, NOT by you. Some states fix it at 18 (matching the age of majority); others allow the custodian to extend to 21 or 25 at account opening.",
        },
        {
          type: "table",
          caption: "Age of termination by state (representative — verify with your state's statute)",
          headers: ["Age", "States"],
          rows: [
            ["18", "California (default), Nevada, Oklahoma, South Dakota, Vermont (UGMA)"],
            ["21 (default in most states)", "New York, Texas, Florida, Illinois, Pennsylvania, Massachusetts, Ohio, Virginia, and most others"],
            ["Custodian can extend to 21 at opening", "Most states with default 18"],
            ["Custodian can extend to 25 at opening", "California, Florida, Illinois, Maine, Massachusetts, Nevada, New Hampshire, New Jersey, Tennessee, Virginia"],
          ],
          align: ["left", "left"],
        },
        {
          type: "callout",
          tone: "warning",
          title: "You can ONLY extend at account opening",
          body: "If you open a UTMA at default age (often 21) and decide three years later you'd prefer 25, you cannot retroactively change it. Lock in the maximum your state allows when you open the account — you can always hand the money over earlier if circumstances change.",
        },
        {
          type: "paragraph",
          text: "At the age of termination, the brokerage simply re-titles the account in the child's name. There's no court process, no signature from you, no negotiation. The brokerage may notify the now-adult that the account is theirs and request updated paperwork, but legally the transfer is automatic.",
        },
      ],
    },
    {
      id: "tax-treatment",
      heading: "How custodial accounts are taxed",
      blocks: [
        {
          type: "paragraph",
          text: "Income generated inside a custodial account — dividends, interest, capital gains — is the child's income, reported under the child's Social Security number. But the IRS doesn't let you arbitrage tax brackets by parking your investments in your toddler's name. The Kiddie Tax (see separate guide) taxes unearned income above a small threshold at the parent's marginal rate.",
        },
        {
          type: "key-value",
          caption: "2026 Kiddie Tax brackets for unearned income (estimates)",
          pairs: [
            { label: "First $1,350", value: "Tax-free (offset by child's standard deduction)" },
            { label: "Next $1,350", value: "Taxed at child's rate (typically 10%)" },
            { label: "Above $2,700", value: "Taxed at PARENT's marginal rate" },
          ],
        },
        {
          type: "paragraph",
          text: "Practical implication: for accounts under ~$30K invested in dividend stocks or bonds, the Kiddie Tax is essentially a wash. For accounts over $50K throwing off $3K+ in dividends/interest annually, you're paying your top bracket on the overage — not the kid's 10%. That's still a tax-free first $1,350 you wouldn't get in a taxable brokerage in your name, but it's not the dramatic tax shelter people imagine.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Growth stocks are more tax-efficient than dividend stocks here",
          body: "Unrealized capital gains aren't unearned income until you sell. Stocking the UTMA with low-dividend growth ETFs (e.g. broad-market index funds, growth tilts) defers the Kiddie Tax until eventual sale. Bond funds, REITs, and high-dividend payers throw off Kiddie-Tax-eligible income every year.",
        },
      ],
    },
    {
      id: "fafsa",
      heading: "The FAFSA gotcha (this is the big one)",
      blocks: [
        {
          type: "paragraph",
          text: "Custodial-account assets count as the STUDENT'S assets on the FAFSA — not the parents'. This sounds neutral but is genuinely awful for financial aid purposes, because the FAFSA assesses student assets at 20% per year, vs parent assets at a maximum of 5.64% per year.",
        },
        {
          type: "paragraph",
          text: "A $40,000 UTMA balance therefore reduces the student's annual financial aid by ~$8,000 — every year of college. The same $40,000 held in a 529 plan owned by the parent reduces it by ~$2,256. Over four years, that's a $23,000 swing in expected aid.",
        },
        {
          type: "callout",
          tone: "danger",
          title: "If you might qualify for need-based aid, this matters a lot",
          body: "Households making under ~$120K with 1+ kids approaching college age should think hard about UTMA balances. Need-based aid (Pell Grants, subsidized loans, institutional grants) is sensitive to reported assets. Even merit-based aid at some schools incorporates FAFSA data.",
        },
        {
          type: "paragraph",
          text: "If you've already funded a UTMA and the FAFSA timing is unfortunate, there's a legal workaround: spend down the UTMA on the child's behalf BEFORE filing the FAFSA. Pay for the kid's school-related computer, summer camp, instrument, tutoring, tuition for a year. UTMA funds can legally be spent on anything that benefits the child, even before they turn 18 — the custodian's fiduciary obligation is to the child, not to keeping the assets parked.",
        },
      ],
    },
    {
      id: "when-it-makes-sense",
      heading: "When custodial accounts make sense",
      blocks: [
        {
          type: "list",
          items: [
            "Households unlikely to qualify for need-based financial aid (>$200K income / >$1M assets).",
            "Gifts from grandparents who want to give the child money but not directly through the parents.",
            "Cases where the goal is broader than college — first car, wedding, house down payment, business seed.",
            "Annual gift-tax exclusion ($19K/donor/year in 2026) management — UTMAs are a clean way to use the exclusion without retaining control.",
            "When the kid is mature enough that handing them control at 18-21 isn't a foreseeable disaster.",
          ],
        },
        {
          type: "list",
          items: [
            "Custodial accounts are NOT a substitute for a 529 if the goal is purely college. The 529's tax + FAFSA advantages dominate for college-only purposes.",
            "Custodial accounts are NOT a substitute for a Custodial Roth IRA if the child has earned income — see that separate guide.",
            "Custodial accounts are NOT a substitute for a trust if you want to retain control past age 25. If you want to defer access until 30+ or attach conditions (graduation, sobriety, etc.), use a trust drafted by an attorney. UTMAs cannot be conditional.",
          ],
        },
      ],
    },
  ],
  quiz: [
    {
      question:
        "You opened a UTMA for your child five years ago and now want to extend the age of termination from 18 to 25. What can you do?",
      options: [
        "File a paper amendment with the brokerage to extend it",
        "Get a court order from family court to modify the trust",
        "Nothing — the age is locked at account opening and cannot be retroactively extended",
        "Roll the UTMA into a new UTMA opened with age 25",
      ],
      correctIndex: 2,
      explanation:
        "UTMA age of termination is set at account opening per state statute and cannot be extended later. Roll-out to a new account would still be the child's money and a transfer would be a taxable event. If you want flexibility, lock in your state's maximum age when opening.",
    },
    {
      question:
        "A grandparent funds a $50,000 UTMA for your high-school-junior child. Compared to the same $50,000 in a parent-owned 529, how does this affect FAFSA need-based aid eligibility?",
      options: [
        "Identically — both count toward parental assets",
        "Better in the UTMA — student assets are sheltered",
        "Roughly $2,800/year worse in the UTMA (20% assessment vs ~5.64%)",
        "Doesn't matter — FAFSA only counts retirement accounts",
      ],
      correctIndex: 2,
      explanation:
        "Student-owned assets (UTMA) are assessed at 20% per year on the FAFSA. Parent-owned assets (529) at a maximum of 5.64%. On $50K, that's ~$10K vs ~$2,820 in reduced aid annually. Over four years, ~$28K difference.",
    },
    {
      question:
        "Your UTMA throws off $4,500 of dividend income in 2026 from a $90K balance. How is that taxed under the Kiddie Tax?",
      options: [
        "All $4,500 at the child's (low) marginal rate",
        "All $4,500 at the parent's marginal rate",
        "First $1,350 tax-free, next $1,350 at child's rate, remaining $1,800 at parent's rate",
        "First $2,700 tax-free, remaining $1,800 at child's rate",
      ],
      correctIndex: 2,
      explanation:
        "2026 Kiddie Tax brackets (estimated): first $1,350 covered by standard deduction, next $1,350 at child's rate (10%), anything above the $2,700 combined threshold at the parent's marginal rate. Custodial accounts are not the dramatic tax shelter people sometimes claim — they're a slight benefit on the first ~$2,700 of unearned income.",
    },
    {
      question:
        "Which is true about UGMA vs UTMA for a brokerage account holding only stocks and ETFs?",
      options: [
        "UGMA has lower tax rates",
        "UTMA gives the parent more legal control after age of termination",
        "They behave essentially identically — the difference matters only for non-security assets like real estate",
        "UGMA accounts are federal; UTMA accounts are state-administered",
      ],
      correctIndex: 2,
      explanation:
        "For ordinary brokerage holdings (stocks, bonds, ETFs, mutual funds), UGMA and UTMA are functionally identical. UTMA's advantages — allowing real estate, art, IP, and higher age-of-termination options — only matter for non-security assets or when a parent wants the option to extend to 21/25.",
    },
    {
      question:
        "Your child has a $30K UTMA balance. They're now 17 and planning to apply to need-based-aid-friendly colleges next year. What's a legal way to reduce the FAFSA hit?",
      options: [
        "Move the money to your own taxable brokerage account",
        "Spend down UTMA funds on legitimate child-benefit expenses (school computer, instrument, tutoring, summer programs) before filing the FAFSA",
        "Have the child sign a waiver giving the money back to you",
        "Convert the UTMA into a 529 in your name",
      ],
      correctIndex: 1,
      explanation:
        "Options A and C are illegal (transferring child's assets back is a breach of fiduciary duty); D is technically possible via a UTMA-to-529 rollover but the FAFSA still considers the 529 as a student-owned asset if it originated from the UTMA. Legitimate spend-down on child-benefit expenses is legal and effective — UTMA funds were always allowed to be used for the child's benefit.",
    },
  ],
};

const custodialRothIra: Guide = {
  slug: "custodial-roth-ira-for-minors",
  title: "Custodial Roth IRA: Tax-Free Growth from Age 0",
  topic: "retirement",
  difficulty: "intermediate",
  summary:
    "The most underused account in personal finance — a Roth IRA opened in a minor's name, funded with their earned income. Sixty-plus years of tax-free compounding.",
  readingMinutes: 8,
  lastReviewed: "2026-05-13",
  keyFacts: [
    { label: "2026 Contribution Limit", value: "Lesser of $7,000 or child's earned income" },
    { label: "Eligibility", value: "Child must have W-2 or 1099 income — verifiable" },
    { label: "Account Type", value: "Custodial Roth IRA (becomes the child's outright at age of majority)" },
    { label: "Tax Treatment", value: "After-tax in, tax-free forever out" },
    { label: "Most Famous Example", value: "$3,500 contributed at age 10 → ~$215K by age 65 at 7% return" },
    { label: "FAFSA Impact", value: "Retirement assets are EXCLUDED from FAFSA" },
  ],
  sections: [
    {
      id: "what-it-is",
      heading: "What a Custodial Roth IRA actually is",
      blocks: [
        {
          type: "paragraph",
          text: "A Custodial Roth IRA is structurally identical to a regular Roth IRA — same contribution limits ($7,000 in 2026), same income phase-outs, same withdrawal rules — except it's opened in a minor's name with a parent or guardian as the custodian. When the child reaches the age of majority in your state (usually 18 or 21), the account becomes theirs outright with no tax event.",
        },
        {
          type: "paragraph",
          text: "It is, by significant margin, the most powerful retirement tool available to anyone who has it. Every additional year of tax-free compounding turns into geometric returns at the back end. A $3,500 contribution at age 10 — left untouched, compounding at a realistic 7% net of inflation — grows to roughly $215,000 by age 65. That's a 60x return entirely tax-free, on $3,500 the kid earned mowing lawns one summer.",
        },
        {
          type: "callout",
          tone: "info",
          title: "The math is the marketing",
          body: "Time is the engine of compound growth. A 10-year-old has a 55-year runway. A 25-year-old just out of college has 40. The difference between starting at 10 vs 25 isn't 15 years of contributions — it's that the first 15 years of compounding work the hardest, because they compound on the longest tail.",
        },
      ],
    },
    {
      id: "earned-income-requirement",
      heading: "The non-negotiable requirement: earned income",
      blocks: [
        {
          type: "paragraph",
          text: "Roth IRA contributions must be 'earned income' under IRS rules. Allowance doesn't count. Gifts don't count. Investment income doesn't count. The child must have actually earned the money through work — wages from an employer (W-2), or self-employment income (1099 or just reported on Schedule C).",
        },
        {
          type: "key-value",
          caption: "What counts as earned income for a minor",
          pairs: [
            { label: "Babysitting / lawn-mowing for neighbors", value: "Yes — Schedule C self-employment income" },
            { label: "Working for your family business", value: "Yes — must be real, age-appropriate work at market rate" },
            { label: "W-2 from a part-time job", value: "Yes — easiest case to document" },
            { label: "Modeling / acting income", value: "Yes — IRS has rulings on this since the 1980s" },
            { label: "Allowance, gifts, birthday money", value: "No — not earned income" },
            { label: "Investment dividends from a UTMA", value: "No — investment income, not earned" },
            { label: "Stipends for academic awards", value: "Generally no — usually treated as scholarship income" },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Document everything, even for tiny amounts",
          body: "The IRS can audit a Roth IRA contribution years later. Keep records: invoices the kid wrote for neighbors, deposit receipts, a simple log of dates worked and amounts received. For W-2 income, the pay stubs are your documentation. For Schedule C income under $400/year, technically no return is required but it's wise to keep the records anyway.",
        },
        {
          type: "paragraph",
          text: "The contribution limit is the LESSER of $7,000 (2026 limit) or the child's earned income. If your 8-year-old earned $850 from helping at a family business this summer, the maximum Roth IRA contribution is $850. Not $7,000. You can't pre-fund the limit based on future expected earnings.",
        },
      ],
    },
    {
      id: "family-business-strategy",
      heading: "The family business angle",
      blocks: [
        {
          type: "paragraph",
          text: "If you own a business (sole proprietor, LLC, S-Corp), you can legitimately employ your minor children for age-appropriate work at market-rate wages. This is the most common path to fully funding a Custodial Roth IRA every year from when the kid can do useful work — typically age 7-8 onward.",
        },
        {
          type: "paragraph",
          text: "The IRS allows this and it has additional tax benefits beyond the Roth: wages paid to your own children under 18 by a parent-owned sole prop or LLC (not S-Corp) are exempt from FICA payroll taxes. The child's wages are also deductible as a business expense for you. And if the child stays under the standard deduction ($15,750 in 2026 estimated for single filers), they pay no federal income tax on the wages.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Triple tax efficiency",
          body: "Your kid earns $7,000 from your business → you deduct $7,000 as a business expense (saving your marginal rate) → the kid pays no income tax (under standard deduction) → the kid contributes $7,000 to a Custodial Roth → it grows tax-free for 60 years. The total tax saved across the family unit is significant, and the contribution is fully Roth.",
        },
        {
          type: "callout",
          tone: "danger",
          title: "It has to be real work at a real wage",
          body: "The IRS has audited and disallowed obviously bogus arrangements (paying a 4-year-old $20K/year to 'consult'). Work must be age-appropriate, hours must be reasonable, the wage must be defensible as market-rate for the work. Filing paperwork, basic organizing, social media tasks, stuffing envelopes, modeling for your business's marketing — all fine. 'Strategic advisor' for a kindergartener — not fine.",
        },
      ],
    },
    {
      id: "fafsa",
      heading: "The FAFSA bonus",
      blocks: [
        {
          type: "paragraph",
          text: "Retirement accounts (Roth IRA, Traditional IRA, 401(k), 403(b), etc.) are EXPLICITLY excluded from FAFSA asset reporting. This is the underrated half of the Custodial Roth advantage: not only is the growth tax-free, but the entire balance doesn't reduce your child's financial aid eligibility.",
        },
        {
          type: "paragraph",
          text: "A $50,000 UTMA reduces your child's annual aid by ~$10,000. A $50,000 Custodial Roth IRA reduces it by $0. If you're picking between funding a UTMA vs a Custodial Roth IRA and the child has any earned income at all, the Roth is mathematically dominant for need-based-aid-eligible households.",
        },
      ],
    },
    {
      id: "withdrawal-flexibility",
      heading: "Withdrawal flexibility (don't sleep on this)",
      blocks: [
        {
          type: "paragraph",
          text: "Roth IRA contributions (not earnings) can be withdrawn anytime, tax-free and penalty-free. So if your now-adult child decides at 28 to use $20,000 of contributions for a house down payment, that's allowed. The earnings continue compounding tax-free.",
        },
        {
          type: "paragraph",
          text: "There's also a first-time homebuyer exception that lets the now-adult child withdraw up to $10,000 of EARNINGS (not just contributions) for a first home purchase without the 10% early-withdrawal penalty (still taxable if under 59½, but no penalty).",
        },
        {
          type: "paragraph",
          text: "This combination — total liquidity on contributions + the first-home earnings exception — makes the Custodial Roth more flexible than people often realize. It is not a 'locked away until 65' account. It's an enormously tax-advantaged account that can also serve as an emergency fund and home-purchase fund.",
        },
      ],
    },
    {
      id: "opening-one",
      heading: "How to actually open one",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Pick a brokerage that offers Custodial Roth IRAs — Fidelity, Schwab, and Vanguard all do for free with no minimums (as of 2026).",
            "You'll need the child's SSN, your SSN, and proof of the child's earned income (pay stub, Schedule C summary, invoices).",
            "Account opens in the child's name with you as custodian. You make all investment decisions until age of majority.",
            "Set up auto-contributions or annual lump-sum contributions up to the limit OR the child's earned income, whichever is less.",
            "Invest in a broad-market index fund (VTI, VTSAX, SWTSX). Don't overthink it — at this time horizon, low-cost diversified equity exposure is the right answer.",
            "At age of majority, the brokerage converts the account to the child's name. They retain all the same tax advantages.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Start the 5-year clock as early as possible",
          body: "The Roth's 5-year clock starts the year of the first contribution. Even a $100 contribution in year one starts the clock for tax-free earnings withdrawals — separate from the contribution-anytime rule. Future-you (or future-them) will thank you.",
        },
      ],
    },
  ],
  quiz: [
    {
      question:
        "Your 8-year-old earned $1,200 babysitting cousins over the summer (paid in cash, not on a W-2). What's the maximum Roth IRA contribution allowed for them in 2026?",
      options: [
        "$0 — Roth IRA requires W-2 income only",
        "$1,200 — limited by their earned income",
        "$7,000 — the standard limit",
        "$3,500 — half the limit, since they're a minor",
      ],
      correctIndex: 1,
      explanation:
        "Roth IRA contributions are capped at the LESSER of $7,000 (2026 limit) or the child's earned income. Self-employment income (Schedule C — babysitting, lawn mowing, etc.) is fully eligible — it doesn't have to be W-2. Keep records of the work; the IRS can audit Roth contributions retroactively.",
    },
    {
      question:
        "Compared to a UTMA, how does a Custodial Roth IRA affect a college-age student's FAFSA?",
      options: [
        "Worse — student retirement assets are assessed at 35%",
        "Same — both are student-owned assets",
        "Better — Roth IRA principal counts, earnings excluded",
        "Better — retirement accounts are entirely excluded from FAFSA reporting",
      ],
      correctIndex: 3,
      explanation:
        "All retirement accounts (Roth IRA, Traditional IRA, 401(k), etc.) are explicitly excluded from FAFSA asset reporting. A $50K Custodial Roth reduces aid by $0, vs $10K/year for a UTMA. This makes the Custodial Roth dominant for need-based-aid-eligible households when the child has earned income.",
    },
    {
      question:
        "A parent who owns a sole proprietorship employs their 12-year-old child to file paperwork for $7,000/year. Which is true about the tax treatment?",
      options: [
        "The wages are subject to standard FICA payroll taxes",
        "The wages are exempt from FICA, deductible to the business, and below the standard deduction (so no federal income tax for the child)",
        "The IRS prohibits employing minors under 14",
        "The wages must be reported as gift income, not earned income",
      ],
      correctIndex: 1,
      explanation:
        "Wages paid to your own child under 18 by a sole proprietorship or single-member LLC (NOT S-Corp or partnership with non-parent owners) are exempt from FICA. They're deductible to the business at your marginal rate. The child pays no federal income tax up to the standard deduction (~$15,750 in 2026 estimated). And the child can contribute the full amount to a Custodial Roth IRA. All legal — but the work must be real and age-appropriate.",
    },
    {
      question:
        "Your child contributed $5,000 to their Custodial Roth at age 16. At age 28, they want to withdraw $4,000 for a wedding. Is this allowed?",
      options: [
        "No — Roth IRA funds are locked until age 59½ except for medical hardship",
        "Yes — they can withdraw contributions (not earnings) anytime, tax-free and penalty-free",
        "Yes, but a 10% penalty applies",
        "Yes, but only if they pay tax on the withdrawal",
      ],
      correctIndex: 1,
      explanation:
        "Roth IRA contributions (the principal — not the earnings) can be withdrawn anytime, with no tax and no penalty. This is one of the most flexible features of the Roth. Earnings are different — those have age and 5-year-rule restrictions. The contribution-anytime rule is what makes the Custodial Roth function as a dual-purpose retirement + emergency account.",
    },
    {
      question:
        "Which of these is NOT considered earned income for the purposes of funding a Custodial Roth IRA?",
      options: [
        "Wages from working at a parent's business doing age-appropriate tasks",
        "Self-employment income from babysitting neighbors",
        "$3,000 of dividends from a UTMA brokerage account",
        "1099 income from modeling for a local advertising campaign",
      ],
      correctIndex: 2,
      explanation:
        "Dividend, interest, and capital-gain income from investments is UNEARNED income — it doesn't qualify for Roth IRA contributions. The other three are all earned income (W-2 wages, self-employment, or 1099). The Roth rule is simple: the income has to come from labor (the child's work), not from capital.",
    },
  ],
};

const coverdellEsa: Guide = {
  slug: "coverdell-esa-vs-529",
  title: "Coverdell ESA vs 529: When Each Wins",
  topic: "education-funding",
  difficulty: "intermediate",
  summary:
    "The $2,000-a-year cousin to the 529. Coverdell wins on K-12 flexibility and investment choice; 529 wins on contribution limits and state tax breaks. Why most families use both.",
  readingMinutes: 7,
  lastReviewed: "2026-05-13",
  keyFacts: [
    { label: "Coverdell Contribution Limit", value: "$2,000 / beneficiary / year (all contributors combined)" },
    { label: "Coverdell Income Phase-Out", value: "MAGI $95K–$110K single, $190K–$220K MFJ" },
    { label: "Coverdell Investment Choice", value: "Any brokerage holding — stocks, bonds, ETFs, MFs" },
    { label: "Coverdell Use", value: "K-12 + college + post-secondary trade/vocational" },
    { label: "529 Contribution Limit", value: "$19K/year (gift tax limit) or $95K front-loaded; lifetime ~$300-550K" },
    { label: "529 Investment Choice", value: "Plan-specific menus (~10-30 fund choices)" },
  ],
  sections: [
    {
      id: "what-coverdell-is",
      heading: "What a Coverdell ESA is",
      blocks: [
        {
          type: "paragraph",
          text: "A Coverdell Education Savings Account (ESA) is a tax-advantaged investment account for education expenses, originally created in 1997 and named for the late senator Paul Coverdell. Like the Roth IRA, contributions are after-tax. Like the Roth, growth is tax-free. Like the 529, withdrawals are tax-free when used for qualifying education expenses.",
        },
        {
          type: "paragraph",
          text: "The hard constraint: $2,000 contribution limit per beneficiary per year, across ALL contributors combined. This makes it impossible for Coverdell alone to fund a four-year private college (which now runs $80,000+/year). Most families that use Coverdells use them as a SUPPLEMENT to a 529, not a replacement.",
        },
        {
          type: "callout",
          tone: "info",
          title: "$2,000/year is the everyone-combined cap",
          body: "If grandparents A contribute $2,000 in January and grandparents B contribute another $1,000 in March, the second contribution creates a 6% excise tax penalty until withdrawn. Coordinate among contributors.",
        },
      ],
    },
    {
      id: "key-differences",
      heading: "Coverdell vs 529 — the actual differences",
      blocks: [
        {
          type: "table",
          caption: "Side-by-side feature comparison (2026)",
          headers: ["Feature", "Coverdell ESA", "529 Plan"],
          rows: [
            ["Annual contribution limit", "$2,000/beneficiary (all contributors)", "$19K/donor (gift tax limit); $95K 5-year front-load"],
            ["Lifetime contribution limit", "Effectively $36K ($2K × 18 years)", "$300K–$550K depending on state"],
            ["Contributor income limit", "Phases out at $95K–$110K single / $190K–$220K MFJ", "None"],
            ["Use for K-12 tuition", "Yes, up to full amount", "Yes, but $10K/year cap"],
            ["Use for K-12 expenses (books, computers, etc.)", "Yes — broad", "Tuition only (the $10K cap)"],
            ["Use for college", "Yes — full QHEE list", "Yes — full QHEE list"],
            ["Use for trade school / apprenticeships", "Yes", "Yes (since 2019)"],
            ["Investment choices", "Any brokerage holding", "Plan-specific menu (10-30 funds typically)"],
            ["Federal tax treatment", "Tax-free growth + qualified withdrawals", "Tax-free growth + qualified withdrawals"],
            ["State tax deduction", "Usually none", "Many states offer in-state plan deduction"],
            ["Age limit", "Must be used by age 30 (or rolled to family member)", "No age limit"],
            ["FAFSA treatment (parent-owned)", "Parent asset (~5.64%)", "Parent asset (~5.64%)"],
          ],
          align: ["left", "left", "left"],
        },
      ],
    },
    {
      id: "when-coverdell-wins",
      heading: "When the Coverdell is the right answer",
      blocks: [
        {
          type: "list",
          items: [
            "You want to use the funds for K-12 private school tuition AND books/computers/uniforms/etc. — Coverdell covers everything; 529 only covers tuition for K-12.",
            "You want full investment choice (individual stocks, low-cost ETFs not in your 529 plan, etc.) rather than the plan-curated menu.",
            "You're already maxing the 529 contribution and want to layer additional tax-advantaged growth.",
            "The beneficiary is under 18 and you specifically want a tightly-bounded account, not the much-larger 529 capacity.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Income phase-out is real",
          body: "If your household MAGI exceeds the phase-out, you cannot contribute to a Coverdell directly. Workaround: GIFT $2,000 to the child each year (or grandparent gifts to the grandchild) and have the recipient contribute. There's no income limit on the beneficiary or non-parent contributors as long as the limit isn't exceeded.",
        },
      ],
    },
    {
      id: "when-529-wins",
      heading: "When the 529 is the right answer",
      blocks: [
        {
          type: "list",
          items: [
            "You need to save more than $2,000/year — the most common case.",
            "You want your state's income-tax deduction for in-state 529 contributions (a 5-6% immediate return in high-tax states).",
            "You want to front-load via the 5-year gift averaging ($95K up front in 2026), useful for grandparents wanting to make a large early gift.",
            "You're not sure if the beneficiary will use the funds by age 30 — 529s have no age limit, Coverdells force a transfer or distribution.",
            "You want the (post-Secure Act 2.0) option to roll up to $35,000 of unused 529 funds into a Roth IRA for the beneficiary.",
          ],
        },
        {
          type: "paragraph",
          text: "The 529 Roth-rollover feature deserves emphasis. Starting in 2024 (and refined since), if a 529 has been open 15+ years and the beneficiary has earned income, up to $35,000 of unused 529 balance can be rolled into the beneficiary's Roth IRA over their lifetime (subject to annual Roth limits). This effectively converts 'oversaved' college money into retirement savings without the 10% non-qualified withdrawal penalty. Coverdells don't have this — leftover Coverdell funds either transfer to a sibling or get distributed with tax + 10% penalty on the earnings.",
        },
      ],
    },
    {
      id: "common-strategy",
      heading: "The common strategy: use both",
      blocks: [
        {
          type: "paragraph",
          text: "For households that can afford it, the practical play is to fund both. The 529 carries the bulk (state tax deduction + larger amounts + Roth rollover safety net). The Coverdell carries K-12 expenses and any non-traditional investment choices you want.",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "529 — fund up to your state's tax-deduction cap each year (usually $5K-20K), invested in low-cost age-based or static index portfolio.",
            "Coverdell — additional $2,000/year if you want K-12 flexibility or specific investment access.",
            "Custodial Roth IRA — if the child has earned income (separate dominant strategy for retirement).",
            "UTMA — last priority for additional after-tax investing if the previous three are exhausted (and FAFSA isn't a concern).",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Stacking order matters",
          body: "529 first (state tax break is immediate). Coverdell next if K-12 expenses are anticipated. Custodial Roth if earned income exists. UTMA last. Most families don't have the cash flow to do all four — the 529 alone usually suffices for college-only saving.",
        },
      ],
    },
  ],
  quiz: [
    {
      question:
        "Your MAGI is $250K (MFJ). Can you directly contribute to a Coverdell ESA for your child in 2026?",
      options: [
        "Yes — Coverdell has no income limit",
        "No — you're above the $190K-$220K phase-out range",
        "Yes, but only up to $1,000",
        "Yes, but you must contribute via a 529 rollover",
      ],
      correctIndex: 1,
      explanation:
        "Coverdell contributor income phase-out is $190K-$220K for MFJ in 2026. Above $220K, you cannot contribute directly. Workaround: gift $2,000 to a grandparent or to the child, and have them make the contribution — there's no income limit on non-parent contributors.",
    },
    {
      question:
        "Which of these is a use that's allowed for Coverdell ESA funds but NOT for 529 plan funds?",
      options: [
        "Paying for private elementary school tuition (over $10K/year)",
        "Paying for college tuition",
        "Paying for graduate school",
        "Paying for trade-school tuition",
      ],
      correctIndex: 0,
      explanation:
        "529s limit K-12 use to $10,000/year of TUITION (only). Coverdell covers full K-12 tuition with no annual cap AND covers K-12 books, computers, uniforms, transportation, etc. — none of which are 529-eligible at the K-12 level. The other options are all allowed under both.",
    },
    {
      question:
        "Your 529 balance is $80K for a kid who got a full scholarship. What can you do with the excess starting in 2026 (assuming the 529 has been open 15+ years)?",
      options: [
        "Nothing — withdraw with 10% penalty on earnings",
        "Roll up to $35K total over their lifetime into the beneficiary's Roth IRA, subject to annual Roth limits",
        "Roll the entire $80K into the beneficiary's Roth IRA tax-free",
        "Transfer to a sibling tax-free with no limit",
      ],
      correctIndex: 1,
      explanation:
        "Option B is the SECURE 2.0 provision (in effect since 2024). Up to $35,000 LIFETIME can be rolled from a 529 to the beneficiary's Roth IRA, but limited each year to the Roth contribution limit ($7K in 2026), and only if the 529 has been open 15+ years. Option D is also true — you can change the 529 beneficiary to a sibling at any time with no tax — but only B is the new Roth-rollover provision.",
    },
    {
      question:
        "A grandparent funds a $2,000 Coverdell ESA in January. In March, the parents try to contribute another $1,000. What happens?",
      options: [
        "Allowed — the limit is per-contributor",
        "Allowed — each parent has their own $2,000 limit",
        "The $1,000 over-contribution triggers a 6% excise tax annually until withdrawn",
        "The parents' contribution is automatically reduced to $0",
      ],
      correctIndex: 2,
      explanation:
        "Coverdell's $2,000 limit is PER BENEFICIARY across ALL contributors combined. The $1,000 over-contribution faces a 6% excise tax penalty annually until the excess is withdrawn. Contributors must coordinate. The 529 has no similar issue — multiple contributors can each contribute up to the gift-tax limit ($19K in 2026).",
    },
    {
      question:
        "Your 529 plan has 25 fund choices. Your beneficiary wants exposure to a specific small-cap value ETF (VBR) that's not in the plan menu. Best option?",
      options: [
        "Override the plan and buy VBR through the 529",
        "Coverdell ESA — broker-of-choice gives access to any ETF",
        "Roll the 529 into a UTMA",
        "Open a second 529 at a different state's plan",
      ],
      correctIndex: 1,
      explanation:
        "529s are limited to their plan's curated menu. Coverdell ESAs at a discount broker (Fidelity, Schwab, Vanguard) give you the same investment universe as a regular brokerage account — any individual stock, ETF, mutual fund, or bond. This is one of the underrated Coverdell advantages. Option D is also valid but uses an entire $19K/year limit on a different plan; Coverdell is the smaller, more targeted answer.",
    },
  ],
};

const kiddieTax: Guide = {
  slug: "kiddie-tax-explained",
  title: "Kiddie Tax: When Your Kid's Account Bites You",
  topic: "tax",
  difficulty: "intermediate",
  summary:
    "The IRS rule that taxes unearned income on a child's account at the PARENT's marginal rate above small thresholds. The gotcha that makes UTMAs less of a tax shelter than people think.",
  readingMinutes: 6,
  lastReviewed: "2026-05-13",
  keyFacts: [
    { label: "Applies To", value: "Unearned income (dividends, interest, capital gains) of dependents under 19 (24 if full-time student)" },
    { label: "Standard Deduction (2026 est.)", value: "$1,350 of unearned income tax-free" },
    { label: "Child's-Rate Band", value: "Next $1,350 taxed at child's rate (typically 10%)" },
    { label: "Parent's-Rate Threshold", value: "Above $2,700 total unearned income — parent's marginal rate applies" },
    { label: "Does NOT Apply To", value: "Earned income (wages, self-employment) — child's full rate" },
    { label: "Reported Where", value: "Child's own Form 1040 + Form 8615 (or parent elects Form 8814)" },
  ],
  sections: [
    {
      id: "history",
      heading: "Why the Kiddie Tax exists",
      blocks: [
        {
          type: "paragraph",
          text: "Before 1986, high-income parents arbitraged tax brackets by parking large investments in their minor children's names. The kid's marginal rate (often 10% or 15%) was way below the parent's (28-50% at the time). $100,000 invested in growth stocks for a 5-year-old saved tens of thousands of dollars in tax each year vs the same investment in the parent's name.",
        },
        {
          type: "paragraph",
          text: "Congress closed this with the Kiddie Tax provision in the Tax Reform Act of 1986. It's been tweaked several times — the most recent significant change was in 2019, when the Trump-era TCJA briefly pegged kid's unearned income above the threshold at trust rates (which is even worse than parent rates for high earners), and then walked that back to today's parent-rate framework.",
        },
        {
          type: "callout",
          tone: "info",
          title: "The Kiddie Tax neutralizes the bracket-shifting incentive",
          body: "For unearned income above the threshold, the kid's account is taxed AS IF the income belonged to the parent. There's no longer a tax benefit to titling investments in the minor's name from a parent's perspective. The remaining benefits of custodial accounts are: tax-free first $1,350 of unearned income, gift-tax management, and FAFSA timing — NOT bracket arbitrage.",
        },
      ],
    },
    {
      id: "how-it-works",
      heading: "How it actually works — the 2026 brackets",
      blocks: [
        {
          type: "key-value",
          caption: "2026 Kiddie Tax brackets for unearned income (estimated, inflation-adjusted from 2025)",
          pairs: [
            { label: "$0 — $1,350", value: "Tax-free (offset by child's standard deduction for unearned income)" },
            { label: "$1,350 — $2,700", value: "Taxed at child's marginal rate (typically 10%)" },
            { label: "$2,700+", value: "Taxed at PARENT's marginal rate (could be 22-37%)" },
          ],
        },
        {
          type: "paragraph",
          text: "These thresholds adjust annually for inflation. The numbers above are best estimates for 2026 — verify with the IRS or your tax software before filing. The 2025 actual figures were $1,300 and $2,600.",
        },
        {
          type: "paragraph",
          text: "The Kiddie Tax applies to dependents who are EITHER under 19 OR under 24 and a full-time student for at least 5 months of the year. The student exception was added because Congress wanted to keep the rule effective through college, when many 19-22-year-old students still have substantial unearned income from parent-funded accounts.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "Capital gains count",
          body: "It's not just dividends and interest. Realized capital gains in a custodial account also count as unearned income for Kiddie Tax purposes. A buy-and-hold-forever strategy defers the tax indefinitely; a tax-loss-harvest-in-November strategy may inadvertently trigger Kiddie Tax in years with large realized gains.",
        },
      ],
    },
    {
      id: "examples",
      heading: "Worked examples",
      blocks: [
        {
          type: "heading",
          level: 4,
          text: "Example 1: Small UTMA ($30K balance)",
        },
        {
          type: "paragraph",
          text: "A $30,000 UTMA invested in a broad-market index fund yielding ~1.5% in dividends generates ~$450 of unearned income annually. That's below the $1,350 standard deduction. Federal tax: $0. The Kiddie Tax is functionally invisible at this balance.",
        },
        {
          type: "heading",
          level: 4,
          text: "Example 2: Medium UTMA ($80K balance)",
        },
        {
          type: "paragraph",
          text: "$80,000 in a high-dividend or bond-heavy portfolio yielding 4%: $3,200 of unearned income. First $1,350 tax-free, next $1,350 at the child's 10% rate ($135), remaining $500 at the parent's rate. If the parent is in the 24% bracket: $120 of additional tax. Total federal tax: $255. Effective rate: 7.97%.",
        },
        {
          type: "heading",
          level: 4,
          text: "Example 3: Large UTMA ($200K balance with realized gains)",
        },
        {
          type: "paragraph",
          text: "$200,000 in a portfolio that throws off $3,000 in dividends + $7,000 in realized capital gains: $10,000 of unearned income. First $1,350 tax-free, next $1,350 at child's rate ($135), remaining $7,300 at the parent's marginal rate. If parent is in the 32% bracket: $2,336 on the overage. Total federal: $2,471. Same realized gains in a taxable account in the parent's name would be at the parent's long-term capital gains rate (15% or 20%) — possibly LOWER than the Kiddie Tax outcome.",
        },
        {
          type: "callout",
          tone: "danger",
          title: "Large UTMAs are sometimes worse than taxable accounts in your name",
          body: "Because Kiddie Tax assesses at the PARENT'S ordinary rate (not their capital gains rate), realizing large gains in a UTMA can result in HIGHER tax than realizing them in your own taxable account. The break-even depends on your bracket. For high earners with large UTMAs and gain-heavy portfolios, the math is unfavorable.",
        },
      ],
    },
    {
      id: "what-to-do",
      heading: "Strategy implications",
      blocks: [
        {
          type: "list",
          items: [
            "Keep UTMA balances modest — under ~$50K — if you want the tax shelter to be a clean win.",
            "Invest UTMA in tax-efficient holdings — broad-market index ETFs, growth-tilted funds — that defer realization rather than throw off annual dividends.",
            "Avoid putting bonds, REITs, MLPs, and other high-yield assets in a UTMA. Park those in tax-deferred accounts in your own name.",
            "Time realizations carefully: a year of low parent income (e.g. between jobs, sabbatical) is a much cheaper time to harvest UTMA gains, since the parent's rate that applies is lower that year.",
            "Consider whether the Custodial Roth IRA is a better destination for the same dollars — Roth has NO Kiddie Tax issue and grows tax-free forever.",
          ],
        },
        {
          type: "paragraph",
          text: "The Kiddie Tax doesn't apply to earned income. If you can route money through a child's Custodial Roth IRA backed by legitimate earned income, you skip the Kiddie Tax entirely AND get the long-term Roth advantage. This is why the Custodial Roth IRA is dominant when the child has any earned income at all.",
        },
      ],
    },
    {
      id: "filing-mechanics",
      heading: "How to actually file it",
      blocks: [
        {
          type: "paragraph",
          text: "Kiddie Tax is reported on the child's own Form 1040 with Form 8615 attached. The child files their own return — even at age 8 — when their unearned income exceeds the threshold. The child's filing fully reports their income; the Kiddie Tax portion just applies the parent's rate to the relevant slice.",
        },
        {
          type: "paragraph",
          text: "There's a parent-election alternative on Form 8814 that lets the parent report the child's investment income on the parent's own return. This is usually worse — it can push the parent into a higher bracket and may eliminate some of the child's standard deduction. Only useful when the child's unearned income is below ~$13,000 and the parent's marginal rate is below the child's effective Kiddie Tax rate.",
        },
        {
          type: "callout",
          tone: "tip",
          title: "Tax software handles this fine",
          body: "TurboTax, H&R Block, FreeTaxUSA, etc. all handle Form 8615 correctly when you enter the child's 1099-DIV / 1099-INT / 1099-B information. The IRS made the calculation purely formulaic in 2019 — there's no judgment call. The hardest part is remembering that the kid has to file at all.",
        },
      ],
    },
  ],
  quiz: [
    {
      question:
        "Your 14-year-old's UTMA had $3,000 of dividend income in 2026 (your marginal rate: 32%). Roughly how much federal tax is owed?",
      options: [
        "$960 — all $3,000 at the parent's rate",
        "$300 — all $3,000 at the child's rate",
        "$231 — first $1,350 free, next $1,350 at child's rate ($135), remaining $300 at parent's 32% ($96)",
        "$0 — under the de minimis threshold",
      ],
      correctIndex: 2,
      explanation:
        "The Kiddie Tax applies in tiers: first $1,350 tax-free (standard deduction for unearned income), next $1,350 at the child's rate (10% for low-income kid), remainder at the parent's marginal rate. The $300 over the $2,700 threshold gets the 32% parent rate ($96 of tax), bringing the total to $231.",
    },
    {
      question:
        "Which type of income on a 17-year-old's account is NOT subject to the Kiddie Tax?",
      options: [
        "Bond interest from a custodial account",
        "Dividends from a UTMA-held stock portfolio",
        "Wages from a part-time job at a coffee shop",
        "Realized capital gains from selling appreciated stock in the UTMA",
      ],
      correctIndex: 2,
      explanation:
        "The Kiddie Tax applies to UNEARNED income only — dividends, interest, capital gains. Earned income (wages, self-employment) is taxed entirely at the child's own marginal rate, no parent-rate kicker. This is why funneling earned income into a Custodial Roth IRA is so much more efficient than parking gifted assets in a UTMA.",
    },
    {
      question:
        "The Kiddie Tax applies to which children, generally?",
      options: [
        "Anyone under 18",
        "Dependents under 19, OR under 24 and a full-time student",
        "Anyone in K-12 school",
        "Only children with unearned income over $10,000",
      ],
      correctIndex: 1,
      explanation:
        "The Kiddie Tax applies to dependents under 19, OR under 24 if they're a full-time student for at least five months of the tax year. Congress extended it to cover the college years specifically because that's when many parent-funded investment accounts start throwing off material dividends and gains. Once the dependency / student-status conditions fail, the kid is taxed at their own rates.",
    },
    {
      question:
        "You're considering whether to put $20,000 in a high-yield bond fund in your UTMA (4% interest, ~$800/year). Your parent's marginal rate is 24%. What's the better account for this asset?",
      options: [
        "UTMA — bond interest is tax-favored for children",
        "Your own taxable brokerage — bond interest doesn't trigger Kiddie Tax there",
        "Custodial Roth IRA — but only if the child has earned income to back the contribution",
        "529 Plan — bonds aren't allowed in UTMAs",
      ],
      correctIndex: 2,
      explanation:
        "Bond interest is exactly the wrong asset for a UTMA — it's always unearned, throws off taxable income annually, and at moderate balances starts hitting the parent's marginal rate via Kiddie Tax. The Custodial Roth IRA shelters bond interest from tax entirely, tax-free forever. If no earned income is available, the parent's own tax-deferred 401(k) or IRA is the better home for bonds (asset location). Bonds in a UTMA combine the worst of both worlds.",
    },
    {
      question:
        "Your child has $9,000 of capital gains in their UTMA this year. Why is this worse than realizing the same gains in your own taxable brokerage account, if you're a high earner?",
      options: [
        "It isn't worse — capital gains in a UTMA are always at the child's rate",
        "The Kiddie Tax applies your ORDINARY rate (e.g. 32%) to the overage — not your long-term capital gains rate (15% or 20%)",
        "Realizing gains in a UTMA triggers a $500 IRS reporting penalty",
        "UTMA gains can't be offset by losses elsewhere in your portfolio",
      ],
      correctIndex: 1,
      explanation:
        "The Kiddie Tax assesses the parent's ORDINARY marginal rate, not the parent's preferential long-term capital gains rate. A 32%-bracket parent realizing the same long-term gains in their own taxable account would pay 15% LTCG (or 20% if over the threshold). Realized in the UTMA, the overage is taxed at 32%. This is why letting a UTMA accumulate large realized gains is a tax-inefficient strategy for high earners.",
    },
  ],
};

// ═══ FERS pension decision ═══════════════════════════════════════════════

const fersRefundVsDefer: Guide = {
  slug: "fers-refund-vs-deferred-annuity",
  title: "FERS: Refund Your Contributions or Defer the Pension?",
  topic: "retirement",
  difficulty: "intermediate",
  summary:
    "The math behind a $20K-$60K decision most federal employees never think through. Cash out, defer to 62, or take MRA+10 — what actually wins for your situation.",
  readingMinutes: 12,
  lastReviewed: "2026-05-13",
  keyFacts: [
    { label: "Vesting Cliff", value: "5 years of creditable civilian service" },
    { label: "Pension Formula", value: "high-3 × years-of-service × 1.0% per year" },
    { label: "Multiplier Bonus", value: "1.1% if retiring at 62+ with 20+ years" },
    { label: "MRA (born 1970+)", value: "57 years old" },
    { label: "MRA+10 Reduction", value: "5% per year you claim before age 62" },
    { label: "COLA Start Age", value: "62 — regardless of when you start collecting" },
    { label: "Cash Refund Tax Hit", value: "20% withholding + 10% penalty + state tax (~36% if taken directly)" },
    { label: "Break-Even Return", value: "~5% real CAGR over ~48 years to match pension EV" },
  ],
  sections: [
    {
      id: "what-fers-is",
      heading: "What FERS actually is",
      blocks: [
        {
          type: "paragraph",
          text: "FERS — the Federal Employees Retirement System — is a three-legged retirement system for federal employees hired since 1987. The three legs are: (1) a defined-benefit Basic Annuity (the pension everyone calls 'FERS'), (2) the Thrift Savings Plan (TSP — the federal 401(k) equivalent), and (3) Social Security. This guide is about leg #1 only. Your TSP is its own decision; Social Security follows standard rules.",
        },
        {
          type: "paragraph",
          text: "The Basic Annuity is funded by BOTH your contributions (0.8% / 3.1% / 4.4% of salary depending on hire date) AND a much larger employer contribution. The pension you eventually collect at retirement is way bigger than just your contributions back. Cashing out your contributions forfeits the entire employer-funded benefit forever.",
        },
        {
          type: "table",
          caption: "Your employee contribution rate depends on hire date",
          headers: ["Hire date", "Plan", "Employee contribution"],
          rows: [
            ["Before 1/1/2013", "Regular FERS", "0.8%"],
            ["1/1/2013 – 12/31/2013", "FERS-RAE", "3.1%"],
            ["1/1/2014 onward", "FERS-FRAE", "4.4%"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "The contribution rate affects your $28K balance, not your pension",
          body: "Different cohorts (FERS / RAE / FRAE) have different employee contribution rates but the SAME pension formula. A FERS-FRAE employee with 10 years of service gets the same pension as a regular FERS employee with 10 years of service — they just contributed more along the way (which means more $$ available if they cash out, but the same future pension benefit).",
        },
      ],
    },
    {
      id: "vesting",
      heading: "The 5-year vesting cliff",
      blocks: [
        {
          type: "paragraph",
          text: "You become VESTED in the FERS pension after 5 years of creditable civilian service. Before 5 years, the pension benefit is $0 — your only option is to take a refund of your contributions when you leave. After 5 years, you have a real retirement asset that you can either cash out OR leave alone to collect at retirement.",
        },
        {
          type: "list",
          items: [
            "Years 0-4: No pension. Refund is the only option if you leave.",
            "Years 5+: Vested. Pension is real and significant. Refund is one option; deferring to claim later is usually better.",
            "Years 10+: Unlocks MRA+10 retirement (can claim as early as age 57 with reductions).",
            "Years 20+ at 60+: Unlocks immediate retirement (no reductions).",
            "Years 30+ at MRA: Unlocks immediate retirement (no reductions, can claim at 57).",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Sick leave counts toward vesting AND the pension",
          body: "Under FERS, unused sick leave at separation is converted to creditable service for both eligibility AND the pension calculation. Conversion rate: 174 hours = 1 month. A typical 10-year employee with 400+ hours of unused sick leave can push past the 10-year MRA+10 threshold even if their time-served is just under 10 years.",
        },
      ],
    },
    {
      id: "claim-ages",
      heading: "When can you claim?",
      blocks: [
        {
          type: "paragraph",
          text: "If you're vested but leave federal service before retiring outright, you have several future-claim options. The math is governed by your service years and your MRA (Minimum Retirement Age).",
        },
        {
          type: "table",
          caption: "MRA by birth year",
          headers: ["Birth year", "MRA"],
          rows: [
            ["Before 1948", "55"],
            ["1948-1952", "55 + 2 months per year after 1947"],
            ["1953-1964", "56"],
            ["1965-1969", "56 + 2 months per year after 1964"],
            ["1970 and later", "57"],
          ],
        },
        {
          type: "table",
          caption: "Your options based on years of service",
          headers: ["Service years", "Claim age", "Reduction"],
          rows: [
            ["5-9 years", "Deferred annuity at 62 only", "No reduction"],
            ["10-29 years", "MRA+10 starting at MRA, OR defer to 62 (no reduction)", "5% per year under 62 if claimed before 62"],
            ["20+ years", "Age 60 (immediate) OR deferred to 62", "No reduction"],
            ["30+ years", "At MRA (immediate) OR deferred", "No reduction"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "The MRA+10 reduction trap",
          body: "MRA+10 starting before 62 has TWO costs: (1) the actuarial reduction of 5% per year you're under 62 (so 25% at MRA itself, 10% if you wait to 60), AND (2) you don't receive FERS COLAs until you turn 62. So claiming MRA+10 early means BOTH a smaller starting payment AND inflation eating its real value for years before COLAs catch up.",
        },
      ],
    },
    {
      id: "formula",
      heading: "The pension formula",
      blocks: [
        {
          type: "paragraph",
          text: "FERS pension is calculated using a simple but surprisingly under-explained formula:",
        },
        {
          type: "key-value",
          caption: "Annual pension calculation",
          pairs: [
            { label: "Standard", value: "high-3 × years-of-service × 1.0%" },
            { label: "Age 62+ with 20+ years", value: "high-3 × years-of-service × 1.1% (10% bonus)" },
            { label: "Special category (LEO/FF/ATC)", value: "Enhanced formula — see OPM" },
          ],
        },
        {
          type: "paragraph",
          text: "high-3 is the average of your three HIGHEST CONSECUTIVE years (36 months) of basic pay INCLUDING LOCALITY. For most steady federal careers, this equals approximately your final 3 years of salary. Years-of-service is your creditable service in years + months (with sick leave converted via 174 hours/month).",
        },
        {
          type: "callout",
          tone: "warning",
          title: "Your high-3 freezes when you leave",
          body: "If you leave federal service and defer the annuity, the high-3 used in the formula is YOUR ACTUAL FINAL 3 YEARS — frozen in those dollar values forever. You don't get inflation-adjustment between when you leave and when you start collecting. A $115K high-3 in 2026 becomes a $115K high-3 in the formula when you finally claim in 2050. This is one of the most-overlooked costs of deferring.",
        },
      ],
    },
    {
      id: "cola-rules",
      heading: "The COLA rules (the hidden gotcha)",
      blocks: [
        {
          type: "paragraph",
          text: "FERS Cost-of-Living Adjustments don't start until age 62, regardless of when you begin collecting the pension. This is one of the most important rules to understand before claiming MRA+10 early.",
        },
        {
          type: "table",
          caption: "When FERS COLAs apply",
          headers: ["Retiree type", "COLA starts at"],
          rows: [
            ["Disability retiree", "Immediately"],
            ["Survivor annuitant", "Immediately"],
            ["LEO / firefighter / ATC", "Immediately"],
            ["Standard FERS retiree (any age)", "Age 62"],
            ["MRA+10 retiree starting before 62", "Age 62 (no COLA for years before)"],
            ["Deferred annuitant claiming at 62", "Immediately (since payments begin at 62)"],
          ],
        },
        {
          type: "paragraph",
          text: "The COLA itself is the so-called 'diet COLA': when CPI is under 2%, you get the full CPI; when CPI is 2-3%, you get exactly 2%; when CPI is over 3%, you get CPI minus 1%. So if inflation runs 4%, your pension grows 3%. Modest but real.",
        },
        {
          type: "callout",
          tone: "danger",
          title: "MRA+10 at 57 loses 5 years of COLAs",
          body: "If you start MRA+10 at 57 ($X/month nominal), that monthly check stays at $X until you turn 62 — five years of frozen payments while inflation eats away at the real value. Once you hit 62, COLA bumps kick in. This is in ADDITION to the 25% actuarial reduction. The combined effect makes MRA+10 at 57 the worst deferral option for most people.",
        },
      ],
    },
    {
      id: "refund-vs-defer",
      heading: "Refund vs defer: the decision tree",
      blocks: [
        {
          type: "paragraph",
          text: "You can take a refund of your employee contributions at any time after separation. Refunds are processed via OPM Form SF 3106. The decision is whether the cash today beats the deferred pension benefit.",
        },
        {
          type: "heading",
          level: 3,
          text: "How much you actually get if you take a cash refund",
        },
        {
          type: "table",
          caption: "Tax hit on a $28,000 refund",
          headers: ["Path", "Net to you", "Notes"],
          rows: [
            ["Direct cash payout", "~$17,920 (-36%)", "20% withholding + 10% early-withdrawal penalty + state tax"],
            ["Roll to Traditional IRA", "$28,000 (preserved)", "Taxed at future withdrawal as ordinary income"],
            ["Convert to Roth IRA", "~$19,600 net invested", "Pay ~24% federal tax now, then tax-free growth forever"],
          ],
        },
        {
          type: "paragraph",
          text: "Direct cash is almost always wrong — the 36% combined hit means you forfeit a third of the money to taxes BEFORE you can invest it. Traditional IRA rollover preserves the full amount. Roth conversion locks in current tax brackets; only worth it if you expect higher tax brackets in retirement.",
        },
        {
          type: "heading",
          level: 3,
          text: "Refund usually wins if…",
        },
        {
          type: "list",
          items: [
            "You're under 5 years of service (no pension benefit anyway — refund is the only option)",
            "You have $28K of high-interest debt (credit card, personal loan) — paying it off saves 18-25% APR",
            "You expect to return to federal service in 1-2 years (you can redeposit later, but the math is roughly a wash)",
            "Family history of early death (genetics or known health issues) — pension pays less if you don't live long",
            "You have strong reasons to expect 8%+ real returns on investment AND zero behavioral risk",
            "You have an immediate cash crisis that nothing else can solve",
          ],
        },
        {
          type: "heading",
          level: 3,
          text: "Defer usually wins if…",
        },
        {
          type: "list",
          items: [
            "You're 5+ years vested and not in financial distress",
            "You want guaranteed retirement income (longevity insurance)",
            "You don't trust your future-self's discipline with a windfall (pension is forced commitment)",
            "You value inflation-protected income (post-62 COLAs)",
            "You expect a normal lifespan (~85+)",
            "You might return to federal service",
          ],
        },
      ],
    },
    {
      id: "investment-breakeven",
      heading: "Investment break-even math",
      blocks: [
        {
          type: "paragraph",
          text: "If you take the refund and invest it, what return do you need to match the pension's lifetime income? Solving for the real CAGR required to grow $28K into the present value equivalent of the deferred pension stream:",
        },
        {
          type: "key-value",
          caption: "Real return needed to match pension EV (typical 10-year FERS retiree)",
          pairs: [
            { label: "Break-even (expected value, no risk premium)", value: "~5% real CAGR" },
            { label: "Break-even (risk-adjusted for variance)", value: "~6.5-7% real CAGR" },
            { label: "Long-run S&P 500 real return", value: "~7% real (with significant variance)" },
            { label: "60/40 portfolio long-run real return", value: "~5% real (less variance)" },
          ],
        },
        {
          type: "paragraph",
          text: "Translation: a 60/40 buy-and-hold portfolio across 23 years of accumulation + 25 years of drawdown approximately matches the pension in expected-value terms — but with significant variance. A 100% S&P 500 portfolio comfortably beats the pension on expected value, but only if you actually hold through every drawdown without selling.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "Expected value vs guarantee — they're not the same",
          body: "The pension is GUARANTEED at its formula amount. Investment returns are EXPECTED. To replace a guaranteed income with an investment portfolio, you typically need a 1-2% return premium to compensate for the variance. Most people don't fully account for this in their math.",
        },
      ],
    },
    {
      id: "worked-example",
      heading: "Worked example: Albany NY, GS-13 Step 5, 10 years",
      blocks: [
        {
          type: "paragraph",
          text: "Concrete scenario: federal employee hired June 2016, separates April 2026, age 37 at separation, final position GS-13 step 5 in Albany NY locality area, 372 hours of unused sick leave, $28K of FERS Basic Annuity contributions accumulated.",
        },
        {
          type: "heading",
          level: 3,
          text: "Service calculation",
        },
        {
          type: "key-value",
          caption: "Years of creditable service",
          pairs: [
            { label: "Time served (6/12/2016 to 4/30/2026)", value: "9 years, 10 months, 18 days" },
            { label: "Sick leave (372 ÷ 174 hours/month)", value: "2 months, 4 days" },
            { label: "Total creditable service", value: "10 years, 0 months, 22 days (10.06 years)" },
          ],
        },
        {
          type: "paragraph",
          text: "Just barely past the 10-year MRA+10 threshold thanks to sick leave conversion. Without those 372 hours, this employee would have been stuck with deferred-only retirement at 62. Sick leave matters more than people realize.",
        },
        {
          type: "heading",
          level: 3,
          text: "high-3 estimate",
        },
        {
          type: "key-value",
          caption: "Final 36 months of basic pay (Albany NY locality + base)",
          pairs: [
            { label: "May 2023 – mid-2024 (GS-12 step 6 → GS-13 step 1)", value: "~$108K" },
            { label: "Mid-2024 – mid-2025 (GS-13 step 1 → step 3)", value: "~$118K" },
            { label: "Mid-2025 – Apr 2026 (GS-13 step 3 → step 5)", value: "~$124K" },
            { label: "36-month average (estimated high-3)", value: "~$115K" },
          ],
        },
        {
          type: "heading",
          level: 3,
          text: "Pension calculation",
        },
        {
          type: "paragraph",
          text: "Annual pension = $115,000 × 10.06 × 1.0% = $11,569/year (full amount, no reduction). This is the annuity payable starting at age 62. Apply reductions for earlier MRA+10 claims.",
        },
        {
          type: "table",
          caption: "Monthly pension at various claim ages (nominal in 2048+ dollars)",
          headers: ["Claim age", "Reduction", "Monthly", "Years of payments"],
          rows: [
            ["57 (MRA+10)", "-25%", "$723", "28 yrs"],
            ["60 (MRA+10)", "-10%", "$867", "25 yrs"],
            ["62 (full deferred)", "0%", "$964", "23 yrs"],
          ],
          align: ["left", "right", "right", "right"],
        },
        {
          type: "heading",
          level: 3,
          text: "Real purchasing power (2026 dollars equivalent)",
        },
        {
          type: "key-value",
          caption: "Adjusted for inflation between 2026 and claim year (assumes 2.5% avg inflation)",
          pairs: [
            { label: "Monthly at 57 (real)", value: "~$419" },
            { label: "Monthly at 60 (real)", value: "~$504" },
            { label: "Monthly at 62 (real)", value: "~$537" },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "The honest comparison",
          body: "$28K refund rolled to a Traditional IRA, invested at 5% real for 23 years, then withdrawn at 4% annually = ~$288/month real income at 60. The pension at 60 = ~$504/month real (with COLA-adjusted lifetime guarantee). At realistic returns the pension wins. At 7%+ real returns the IRA path roughly matches. Pension still wins on certainty + longevity insurance + forced commitment.",
        },
      ],
    },
    {
      id: "action-items",
      heading: "Action items if you've separated",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            "Pull your final SF-50 (Notification of Personnel Action) from your last day. Note total creditable service AND total sick leave hours.",
            "Call OPM Retirement Operations at 1-888-767-6738. Request a benefits estimate showing your exact high-3, service computation date, and projected annuity at each claim age.",
            "Don't do anything with the FERS Basic Annuity contributions yet — the default (leave them in) is correct. You have years to decide.",
            "Handle your TSP separately. Either roll to Traditional IRA (more fund choices), leave in TSP (ultra-low expense ratios), or roll to Roth if you can absorb the tax hit. Don't take cash from TSP — same 10% penalty issue.",
            "Note your MRA on a calendar 20+ years out. That's when the MRA+10 decision becomes live.",
            "If you might return to federal service: leave the contributions in. Redeposit later is more expensive than letting it ride.",
            "Get FEHB and FEGLI questions answered before they expire — both have tight 'continued enrollment' deadlines (typically requires 5 years immediately preceding retirement, which is forfeit on early separation).",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "OPM provides free counseling",
          body: "Federal employees and former federal employees can get free retirement counseling through OPM. For a $20K-$60K decision, it's worth the time. Alternative: a fee-only CFP who specializes in federal employees (FedSavvy, FedSmith, NITP, etc.) for $200-400/hour. Worth it.",
        },
      ],
    },
  ],
  quiz: [
    {
      question:
        "You separate from federal service after 7 years with $30K in FERS Basic Annuity contributions. What can you do?",
      options: [
        "Nothing — only employees with 10+ years have any pension benefit",
        "Take a refund OR defer the annuity to age 62 (deferred wins by ~2× in present-value terms for most cases)",
        "Claim immediate retirement",
        "Roll the pension benefit into your TSP",
      ],
      correctIndex: 1,
      explanation:
        "At 7 years you're vested (>5 years), so you have a real pension benefit. Without 10+ years you can't do MRA+10 — only the deferred annuity at age 62 is available. You can also take a refund of your contributions, but for most people the deferred annuity is worth significantly more than the cash refund.",
    },
    {
      question:
        "What's the BIGGEST hidden cost of claiming MRA+10 at age 57 vs deferring to age 62?",
      options: [
        "The 25% actuarial reduction",
        "FERS COLAs don't apply until age 62, so 5 years of frozen-nominal payments while inflation erodes real value",
        "You forfeit Social Security",
        "You have to repay your TSP loan",
      ],
      correctIndex: 1,
      explanation:
        "The 25% reduction is the obvious cost, but the COLA-not-until-62 rule is the hidden one. Claiming at 57 means 5 years of flat-nominal payments while inflation reduces their real value. Combined with the reduction, MRA+10 at 57 is the worst deferral option for most people. The pension is taxed normally and doesn't affect Social Security or TSP separately.",
    },
    {
      question:
        "You take a $28K FERS contribution refund and want to maximize what you can invest. What's the cleanest route?",
      options: [
        "Direct cash payout — pay the 20% withholding and 10% early withdrawal penalty, invest what remains",
        "Roll the full $28K to a Traditional IRA — no tax now, full amount invested, tax at withdrawal",
        "Convert to Roth IRA — pay ~24% tax now, tax-free growth forever",
        "Buy I-Bonds with the refund",
      ],
      correctIndex: 1,
      explanation:
        "Direct cash loses ~36% to taxes + penalties (terrible). Roth conversion is only worth it if you expect higher tax brackets at withdrawal than your current bracket — typically not the right move for high earners. Traditional IRA rollover preserves the full $28K and defers tax until withdrawal, which is the cleanest path. Future Roth conversions can be done in lower-income years if circumstances warrant.",
    },
    {
      question:
        "Approximately what real annual return on $28K (invested across ~48 years of accumulation + drawdown) is needed to match a 10-year FERS deferred pension in expected-value terms?",
      options: [
        "~2% real (TIPS-like returns)",
        "~5% real (60/40 balanced portfolio long-run average)",
        "~12% real (aggressive but achievable)",
        "Any positive return — investing $28K beats the pension automatically",
      ],
      correctIndex: 1,
      explanation:
        "The break-even is roughly 5% real CAGR — which corresponds to a 60/40 stock/bond portfolio's long-run real return. At this level, expected value is similar between the two paths, but the pension has guarantee + longevity insurance + forced commitment advantages that variance-adjusted returns don't fully capture. Beating the pension on a risk-adjusted basis requires more like 6.5-7% real.",
    },
    {
      question:
        "Your sick leave at separation was 372 hours. How does this affect your FERS service calculation?",
      options: [
        "Sick leave is forfeit at separation — no impact",
        "Sick leave is converted to creditable service (174 hours = 1 month), so 372 hours adds ~2 months",
        "Sick leave converts to extra contributions, increasing the refund amount",
        "Sick leave converts at 100 hours per month",
      ],
      correctIndex: 1,
      explanation:
        "Under FERS, unused sick leave at separation is converted to creditable service at 174 hours per month. 372 hours ÷ 174 ≈ 2 months, 4 days of additional service. This can be the difference between just-under-10-years (deferred-only) and just-over-10-years (MRA+10 eligible), so it's worth getting the exact number from your final SF-50.",
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
  rothConversionLadder,
  assetLocation,
  socialSecurityClaiming,
  ugmaUtma,
  custodialRothIra,
  coverdellEsa,
  kiddieTax,
  fersRefundVsDefer,
];

export function getGuideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function getGuidesByTopic(topic: GuideTopic): Guide[] {
  return GUIDES.filter((g) => g.topic === topic);
}

// Re-export for convenience in components
export type { ReactNode };
