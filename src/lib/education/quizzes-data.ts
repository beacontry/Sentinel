/**
 * 5-question quizzes for each long-form guide.
 * Pass threshold = 80% (4/5).
 *
 * Kept separate from guides-data.ts to keep the guide objects readable.
 * Lookup via getQuizForGuide(slug) — guides without an entry have no quiz.
 *
 * Authoring rules:
 *   - Exactly 5 questions per guide
 *   - 4 options each, exactly one correct
 *   - Test understanding, not trivia (rules of thumb, decision criteria, traps)
 *   - Explanation should reinforce the lesson, not just confirm correctness
 */

import type { QuizQuestion } from "./guides-data";

export const QUIZZES: Record<string, QuizQuestion[]> = {
  // ─── Roth IRA Deep Dive ─────────────────────────────────────────────
  "roth-ira-deep-dive": [
    {
      question:
        "When is a Roth IRA generally a better choice than a Traditional IRA?",
      options: [
        "When you expect a lower tax bracket in retirement",
        "When you expect a similar or higher tax bracket in retirement",
        "When you need to withdraw the money in 1–2 years",
        "When you have no earned income to contribute against",
      ],
      correctIndex: 1,
      explanation:
        "You pay tax now on Roth contributions and skip it later. That trade-off is profitable when your retirement bracket is at least as high as today's. Younger and lower-income earners almost always win with Roth.",
    },
    {
      question:
        "Both 5-year clocks for the Roth IRA share which key property?",
      options: [
        "They reset every time you open a new Roth IRA",
        "They start the year of your first Roth activity and apply for life (earnings clock); each conversion has its own clock",
        "They expire after 10 years",
        "They only apply to married filers",
      ],
      correctIndex: 1,
      explanation:
        "The earnings clock starts on your first-ever Roth contribution and runs for life. Each conversion has its own independent 5-year clock for penalty-free principal withdrawal under 59½.",
    },
    {
      question:
        "Your Backdoor Roth is at risk of being mostly taxable if you have what?",
      options: [
        "A Roth 401(k) at work",
        "Pre-tax balances in a Traditional / Rollover / SEP / SIMPLE IRA",
        "A taxable brokerage account",
        "An HSA",
      ],
      correctIndex: 1,
      explanation:
        "The pro-rata rule aggregates all your pre-tax IRA balances when determining how much of a conversion is taxable. 401(k)s are NOT counted — rolling pre-tax IRA money into your 401(k) is the standard workaround.",
    },
    {
      question:
        "Which of these is NOT a qualifying source of earned income for Roth IRA contributions?",
      options: [
        "Wages from a W-2 job",
        "Self-employment net profit",
        "Rental income",
        "Combat pay",
      ],
      correctIndex: 2,
      explanation:
        "Investment income, rental income, dividends, and Social Security do not qualify. The Roth needs 'earned income' — wages, self-employment, combat pay, alimony from pre-2019 divorce decrees.",
    },
    {
      question:
        "What is the practical reason to open a Roth IRA with even $1 when you're young?",
      options: [
        "It locks in your contribution limit for life",
        "It starts the 5-year clock for tax-free earnings withdrawals",
        "It triggers a tax credit",
        "It exempts you from RMDs forever",
      ],
      correctIndex: 1,
      explanation:
        "The earnings 5-year clock starts the year of your first contribution and runs for life. Opening even a token Roth in your 20s sets up the clock decades before you actually need it.",
    },
  ],

  // ─── HSA Stealth Retirement ─────────────────────────────────────────
  "hsa-stealth-retirement": [
    {
      question: "Why is the HSA called the 'only triple-tax-advantaged account'?",
      options: [
        "Contributions, growth, and qualified withdrawals are all tax-free",
        "It avoids federal, state, and local income tax",
        "It compounds three times faster than other accounts",
        "It triples your employer's match",
      ],
      correctIndex: 0,
      explanation:
        "Three tax breaks stacked: deductible contributions, tax-free growth inside the account, and tax-free qualified medical withdrawals at any age. No other U.S. account combines all three.",
    },
    {
      question: "What is the 'save receipts' HSA strategy?",
      options: [
        "Mail receipts to your HSA provider monthly to validate withdrawals",
        "Pay current medical bills out of pocket, save receipts forever, reimburse yourself decades later",
        "Buy receipt scanners to deduct in HSA",
        "Submit receipts to qualify for a higher contribution limit",
      ],
      correctIndex: 1,
      explanation:
        "There's no IRS deadline to reimburse a qualified medical expense from an HSA. Pay current bills from cash flow, invest the HSA, save receipts indefinitely, and pull tax-free withdrawals 30+ years later.",
    },
    {
      question: "Which of these immediately disqualifies you from contributing to an HSA?",
      options: [
        "Having a high-deductible health plan (HDHP)",
        "Enrolling in any part of Medicare (including Part A)",
        "Having a Roth IRA",
        "Being self-employed",
      ],
      correctIndex: 1,
      explanation:
        "Medicare enrollment, even Part A only, ends HSA contribution eligibility. Coordinate Social Security and Medicare timing carefully — auto-enrollment in Part A at 65 catches many people.",
    },
    {
      question: "After age 65, an HSA used for non-medical purposes is taxed how?",
      options: [
        "Tax-free (always, after 65)",
        "20% penalty plus ordinary income tax",
        "Ordinary income tax only — no penalty (like a Traditional IRA)",
        "Long-term capital gains rates",
      ],
      correctIndex: 2,
      explanation:
        "After 65, the 20% non-medical penalty disappears. Withdrawals for any purpose are taxed as ordinary income — same as a Traditional IRA. So the HSA is at minimum as good as a Traditional IRA, and better if used for medical expenses.",
    },
    {
      question: "What's a strong reason to transfer your employer's HSA to Fidelity or Lively?",
      options: [
        "It increases your annual contribution limit",
        "It exempts you from HDHP requirements",
        "Many employer HSAs have high fees and limited investment menus; transfers are tax-free",
        "Employer HSAs cannot be invested",
      ],
      correctIndex: 2,
      explanation:
        "HSA-to-HSA transfers are tax-free and unlimited. Many employer HSAs charge monthly fees and offer poor mutual fund menus; Fidelity and Lively are commonly preferred for their full-brokerage flexibility.",
    },
  ],

  // ─── 529 Plans Explained ────────────────────────────────────────────
  "529-plans-explained": [
    {
      question: "How does a state tax deduction influence your 529 plan choice?",
      options: [
        "All states have the same plan rules",
        "States vary: home-state-only, tax parity (any state), or no deduction — pick based on your state's pattern",
        "The deduction is the same regardless of plan",
        "529 deductions are federal, not state",
      ],
      correctIndex: 1,
      explanation:
        "Some states only deduct home-state plan contributions (NY, MA), some have tax parity (any state qualifies — AZ, KS, PA), and some have no deduction. Strategy depends entirely on which bucket your state falls into.",
    },
    {
      question:
        "Under SECURE Act 2.0, how much of an unused 529 can roll to a Roth IRA?",
      options: [
        "Up to $5,000 lifetime",
        "Up to $35,000 lifetime, with the 529 open 15+ years",
        "Up to $100,000 lifetime",
        "There's no rollover option",
      ],
      correctIndex: 1,
      explanation:
        "$35,000 lifetime per beneficiary, 529 open 15+ years, subject to the annual Roth limit, beneficiary needs earned income equal to the rollover. This eliminated the biggest objection to 529s — what if my kid doesn't go to college?",
    },
    {
      question: "Which of these is NOT a qualified 529 expense?",
      options: [
        "Tuition at an accredited college",
        "Computers and software primarily used by the beneficiary",
        "K-12 tuition up to $10,000/yr",
        "Vacation flights to visit campus",
      ],
      correctIndex: 3,
      explanation:
        "Travel costs aren't qualified. Tuition, fees, room and board (capped at school's cost of attendance), books, computers, K-12 tuition (up to $10K/yr), apprenticeships, and student loan repayment ($10K lifetime) are.",
    },
    {
      question:
        "What is the FAFSA financial-aid impact of a parent-owned 529 vs a UTMA?",
      options: [
        "Both are treated identically (5.6%)",
        "529s aren't reported; UTMAs count 20% as student asset",
        "Parent-owned 529 ~5.6% (parent asset); UTMA ~20% (student asset)",
        "Both count as 100% student assets",
      ],
      correctIndex: 2,
      explanation:
        "FAFSA assesses parent assets at ~5.6% but student assets at ~20%. UTMAs always belong to the kid; 529s belong to the parent. Same dollar amount can hit aid eligibility very differently depending on the vehicle.",
    },
    {
      question: "If your child gets a full scholarship and the 529 is overfunded, what's NOT an option?",
      options: [
        "Change the beneficiary to a sibling, cousin, or yourself",
        "Withdraw up to the scholarship amount with no 10% penalty (income tax on earnings still owed)",
        "Roll up to $35K to the beneficiary's Roth IRA (15-yr rule)",
        "Get a full refund of all contributions and earnings tax-free",
      ],
      correctIndex: 3,
      explanation:
        "There's no tax-free recovery of earnings on non-qualified withdrawals. Unused funds have several flexible options (beneficiary change, scholarship-penalty-waiver withdrawal, Roth rollover) but full tax-free recovery isn't one.",
    },
  ],

  // ─── Permanent Life Insurance: An Honest Look ──────────────────────
  "permanent-life-insurance-honest-look": [
    {
      question:
        "What's the typical cost ratio between term and whole life insurance for the same coverage?",
      options: [
        "Term and whole life cost about the same",
        "Whole life is roughly 2× term",
        "Whole life is typically 5–15× the cost of term for the same coverage",
        "Term is more expensive than whole life",
      ],
      correctIndex: 2,
      explanation:
        "A healthy 35-year-old might pay ~$25/mo for $1M of 20-year term but ~$700+/mo for the same coverage in whole life. The spread funds commissions, overhead, profit, and a slow-build cash value.",
    },
    {
      question: "What's the typical net IRR of whole life cash value over 20+ years?",
      options: [
        "8–10% (matches the stock market)",
        "5–7%",
        "2–4%",
        "0%",
      ],
      correctIndex: 2,
      explanation:
        "After commissions, mortality charges, and admin fees, the long-run net IRR on whole life cash value is typically 2–4%. Sales illustrations using 6–7% gross rates obscure this.",
    },
    {
      question: "Which is a TRUE statement about IUL caps?",
      options: [
        "Caps are guaranteed in the contract and cannot change",
        "Caps include the index's dividends",
        "The insurer can lower caps any time, and dividends are typically excluded",
        "Caps reset to the original level after 10 years",
      ],
      correctIndex: 2,
      explanation:
        "IUL caps are insurer-discretionary, frequently lowered over the policy's life, and almost always exclude dividends. So you're benchmarking against the price-only return of the index BEFORE the cap is even applied.",
    },
    {
      question: "What's the 'phantom income' tax bomb in permanent insurance?",
      options: [
        "Capital gains on insurance proceeds",
        "If a policy lapses with an outstanding loan, the loan amount above basis becomes taxable income",
        "Policy dividends are doubly-taxed",
        "Beneficiaries owe tax on death benefits",
      ],
      correctIndex: 1,
      explanation:
        "Lapsing a policy with a large outstanding loan triggers ordinary income tax on the loan amount above your cost basis. People who treat policy loans as 'free money' get crushed by this when premiums become unaffordable later.",
    },
    {
      question:
        "When does permanent life insurance genuinely make financial sense?",
      options: [
        "For everyone — it's always the best option",
        "Estate planning over the federal exemption, lifetime support for special-needs dependents, business buy-sell agreements",
        "When you need coverage for under 10 years",
        "When you can't afford term insurance",
      ],
      correctIndex: 1,
      explanation:
        "Permanent insurance fits HNW estate liquidity, special-needs trusts, business succession funding, and a few niche situations. For 90%+ of families, term + invest the difference in tax-advantaged accounts dominates.",
    },
  ],

  // ─── Order of Operations ────────────────────────────────────────────
  "order-of-operations-where-to-put-your-next-dollar": [
    {
      question: "What comes BEFORE paying off a 22% credit card?",
      options: [
        "Maxing your Roth IRA",
        "Funding a 529 plan",
        "Building a 1-month starter emergency fund and capturing the full 401(k) employer match",
        "Buying a permanent life insurance policy",
      ],
      correctIndex: 2,
      explanation:
        "A 100% match is a 100% guaranteed return — it beats anything else available, including a 22% credit card. Before either, hold a 1-month starter emergency fund so a flat tire doesn't turn into more credit card debt.",
    },
    {
      question: "Why is the employer 401(k) match such a high priority?",
      options: [
        "It compounds tax-deferred",
        "It's a 100% (or 50%) GUARANTEED return — no other product matches that risk-adjusted return",
        "Match dollars are tax-free",
        "It fulfills a legal requirement",
      ],
      correctIndex: 1,
      explanation:
        "A 100%-of-first-4% match is a guaranteed 100% return on the contributed dollars BEFORE any market return. Nothing else legally available offers that. Capture every cent.",
    },
    {
      question:
        "After capturing the employer match and high-interest debt, where should the next dollar typically go?",
      options: [
        "529 plan",
        "Taxable brokerage",
        "Mortgage prepayment",
        "HSA (if HDHP-eligible) and then Roth IRA / Backdoor",
      ],
      correctIndex: 3,
      explanation:
        "HSA's triple-tax advantage beats both Roth and Traditional for many. Then Roth IRA gives flexibility, lower fees than most 401(k) menus, and tax-free growth. Both come BEFORE 529s, taxable, or mortgage prepayment.",
    },
    {
      question: "Why fund 529s only AFTER your own retirement is maxed?",
      options: [
        "529s have higher fees",
        "Kids can borrow for college; you cannot borrow for retirement",
        "529s expire if not used",
        "Federal tax rules require it",
      ],
      correctIndex: 1,
      explanation:
        "The classic reasoning: there are loans, scholarships, and work-study for college; there are no loans for retirement. Sacrificing your retirement for kids' college often forces them to support YOU later — counterproductive for everyone.",
    },
    {
      question:
        "What's the verdict on accelerated payoff of a 3.5% mortgage?",
      options: [
        "Always pay it off as fast as possible",
        "Pay minimums; equity returns reliably exceed the rate over long horizons; emotional value is real but it's an OPTIONAL late-stage step",
        "Refinance to a higher rate",
        "Stop paying it",
      ],
      correctIndex: 1,
      explanation:
        "Mathematically, equities historically beat 3.5% by a wide margin. Emotionally, a paid-off mortgage helps some people sleep. After all tax-advantaged accounts are maxed, accelerated payoff is a legitimate (if optional) step 10 in the order.",
    },
  ],

  // ─── Backdoor and Mega Backdoor Roth ────────────────────────────────
  "backdoor-and-mega-backdoor-roth": [
    {
      question: "What's the most common error that turns a Backdoor Roth into a taxable mess?",
      options: [
        "Forgetting to file Form 8606",
        "Using the wrong brokerage",
        "Contributing on the wrong day",
        "Selecting the wrong investment",
      ],
      correctIndex: 0,
      explanation:
        "Form 8606 documents the non-deductible basis. Without it, the IRS treats the contribution as having zero basis and taxes the entire conversion. File Form 8606 with that year's return.",
    },
    {
      question: "How does the pro-rata rule treat your IRA balances?",
      options: [
        "Each IRA account is treated separately",
        "Only the most recent contribution counts",
        "All your pre-tax IRA balances (Traditional, SEP, SIMPLE, Rollover) are aggregated for proration",
        "Pro-rata only applies to Roth conversions over $50,000",
      ],
      correctIndex: 2,
      explanation:
        "The IRS sums all pre-tax IRA balances to compute the basis percentage. 401(k)s aren't included — rolling pre-tax IRA money into your 401(k) before December 31 is the standard pro-rata workaround.",
    },
    {
      question: "What three plan features must your 401(k) have to enable Mega Backdoor Roth?",
      options: [
        "Roth deferrals, employer match, and a stable value fund",
        "After-tax contributions on top of $23.5K limit, in-plan Roth conversion OR in-service withdrawal, and headroom under the $70K total annual addition limit",
        "Self-directed brokerage, no fees, and unlimited contributions",
        "Only large employers can offer it",
      ],
      correctIndex: 1,
      explanation:
        "All three must be present. Confirm with your Summary Plan Description before assuming it's available — most plans support employee deferrals but only some allow after-tax contributions and the conversion path.",
    },
    {
      question: "Why convert after-tax 401(k) contributions to Roth as quickly as possible?",
      options: [
        "Plan rules require immediate conversion",
        "Any growth between contribution and conversion becomes ordinary income",
        "It increases your contribution limit",
        "It triggers an employer match",
      ],
      correctIndex: 1,
      explanation:
        "The principal is post-tax (no tax on conversion). But any growth before conversion is taxable. Auto-convert weekly or monthly to keep growth (and tax) minimal. Some plans only allow quarterly — accept the small drag.",
    },
    {
      question: "Approximately how much can a high earner with maxed deferral and a $10K match move into Roth via Mega Backdoor (2026 limits)?",
      options: [
        "$7,000",
        "$23,500",
        "$36,500",
        "$70,000",
      ],
      correctIndex: 2,
      explanation:
        "$70,000 total annual addition limit minus $23,500 employee deferral minus $10,000 employer match = $36,500 of headroom for after-tax contributions that convert to Roth.",
    },
  ],

  // ─── Term Life Insurance ────────────────────────────────────────────
  "term-life-insurance": [
    {
      question: "What's the rough rule of thumb for term life coverage amount?",
      options: [
        "$50,000 fixed",
        "10–15× your annual income (adjusted for assets, mortgage, education needs)",
        "Whatever the agent recommends",
        "1× your home's value",
      ],
      correctIndex: 1,
      explanation:
        "10–15× income is the heuristic. The proper calculation: income replacement × years until kids are independent + mortgage payoff + education + final expenses, minus existing assets and spouse's income.",
    },
    {
      question: "Why is laddering policies often cheaper than a single large 30-year policy?",
      options: [
        "Laddering qualifies for a discount",
        "Insurance needs decline as kids grow up and assets accumulate; staggered terms match this curve",
        "Laddering avoids underwriting",
        "Laddering doubles the death benefit",
      ],
      correctIndex: 1,
      explanation:
        "Need is highest in early years (young kids, no assets, full mortgage) and declines as kids launch, assets accumulate, and the mortgage shrinks. Laddered policies (e.g., $1M/10yr + $500K/20yr + $500K/30yr) match the curve and are typically 30–40% cheaper than a single 30-year policy at the peak amount.",
    },
    {
      question: "When should you buy term insurance, ideally?",
      options: [
        "After you become uninsurable",
        "When you turn 65",
        "As soon as anyone depends on your income, while you're young and healthy",
        "Only after retirement",
      ],
      correctIndex: 2,
      explanation:
        "Premiums rise every year and health surprises happen. A 25-year-old non-smoker locks in 30 years at maybe $20/mo; the same coverage at 45 costs 4× that, if approval comes at all.",
    },
    {
      question: "Which rider is generally NOT worth paying for?",
      options: [
        "Conversion option (typically free with base policy)",
        "Waiver of premium for disability",
        "Accidental death rider",
        "Child rider for small face amount",
      ],
      correctIndex: 2,
      explanation:
        "Accidental death is overpriced — your need for coverage doesn't depend on cause of death. Waiver of premium is cheap and useful. Conversion is usually free. Child riders are reasonable for peace of mind but not a replacement for proper coverage.",
    },
    {
      question: "Why use an independent broker rather than a captive agent?",
      options: [
        "Brokers always have lower premiums by law",
        "Brokers shop multiple carriers; captive agents only sell their employer's products",
        "Brokers don't earn commissions",
        "Captive agents can't write term policies",
      ],
      correctIndex: 1,
      explanation:
        "Identical coverage can vary 30%+ across carriers. An independent broker shops; a captive agent (State Farm, Northwestern Mutual) sells their employer's product. Always get quotes from at least 3 carriers via a broker or quote tool.",
    },
  ],

  // ─── Trader Tax Status & MTM ────────────────────────────────────────
  "trader-tax-status-and-mtm-election": [
    {
      question: "What's the deadline to elect §475(f) Mark-to-Market for tax year 2026?",
      options: [
        "April 15, 2025",
        "April 15, 2026 (with the 2025 return or timely-filed extension)",
        "December 31, 2026",
        "April 15, 2027",
      ],
      correctIndex: 1,
      explanation:
        "The election statement is attached to the PRIOR YEAR'S return (or to a timely-filed Form 4868 extension) by April 15 of the year you want it to apply. Miss this date and you wait a full year.",
    },
    {
      question: "What does §475(f) MTM accomplish that Trader Tax Status alone does NOT?",
      options: [
        "Schedule C deductions for trading expenses",
        "Removal of $3K capital-loss limit, ordinary-income treatment, and exemption from wash-sale rules",
        "A lower tax rate on long-term gains",
        "Automatic IRS approval as a professional trader",
      ],
      correctIndex: 1,
      explanation:
        "TTS gives you the Schedule C expense deduction. The MTM election is a bigger commitment — it converts gains to ordinary income (no LTCG benefit), removes the loss limit, and exempts you from wash sales.",
    },
    {
      question: "Which form replaces Form 8949 / Schedule D for §475(f) MTM electors?",
      options: [
        "Form 1040-ES",
        "Form 4797 Part II (ordinary income / loss)",
        "Form 1099-B",
        "Schedule C",
      ],
      correctIndex: 1,
      explanation:
        "MTM electors report trading on Form 4797 Part II as ordinary income, not as capital gains on Form 8949. Trading expenses still flow through Schedule C if you have a separate trading business entity.",
    },
    {
      question: "What's the biggest risk of electing §475(f) and later changing trading style?",
      options: [
        "The election can be revoked at any time",
        "Revoking the election requires formal IRS consent and is rarely granted — you're effectively committed indefinitely",
        "You must re-elect every year",
        "There's no way to get it wrong",
      ],
      correctIndex: 1,
      explanation:
        "Once elected, revocation requires Form 3115 with IRS consent. Practically irreversible. Don't elect lightly — the right candidate is a full-time, consistent day-trader with predictable activity.",
    },
    {
      question: "Why does case law (Holsinger, Endicott) matter for TTS?",
      options: [
        "It establishes the IRS-approved checklist",
        "There's no formal IRS application; case-law factors (frequency, regularity, full-time activity) determine whether you qualify under audit",
        "Cases don't apply to traders",
        "Case law is irrelevant to taxes",
      ],
      correctIndex: 1,
      explanation:
        "TTS is self-declared on your return, but the IRS can challenge it. Cases like Endicott (denied — held a full-time job) define the practical thresholds: 4+ trades/day, 75%+ active days, holdings under 31 days, primary livelihood.",
    },
  ],

  // ─── Wash Sale Deep Dive ────────────────────────────────────────────
  "wash-sale-rules-deep-dive": [
    {
      question: "What happens to a disallowed wash-sale loss in a regular taxable account?",
      options: [
        "It's permanently lost",
        "It transfers to your spouse",
        "It adds to the cost basis of the replacement security and recovers when that lot is sold",
        "You can deduct half of it",
      ],
      correctIndex: 2,
      explanation:
        "In a regular taxable account, the wash sale defers the loss — it's added to the replacement's basis and recovered on eventual sale. The exception (and disaster) is when the replacement is in an IRA.",
    },
    {
      question: "Why is buying the replacement in an IRA particularly bad?",
      options: [
        "IRAs charge a special wash-sale fee",
        "Per Rev. Rul. 2008-5, the disallowed loss is permanently lost — IRAs can't accept the basis adjustment",
        "It triggers an IRS audit",
        "It violates IRA contribution limits",
      ],
      correctIndex: 1,
      explanation:
        "Rev. Rul. 2008-5 addresses this: IRAs don't track basis the same way, so the disallowed loss can't roll into the replacement. Real money loss with zero deductibility, ever. Audit your auto-investments to avoid.",
    },
    {
      question: "Selling SPY at a loss and buying VTI immediately — wash sale?",
      options: [
        "Yes, all S&P-tracking ETFs are substantially identical",
        "No — SPY tracks the S&P 500, VTI tracks the total US market (different index methodology, different holdings)",
        "Only if held under 30 days",
        "Yes — both are US equity",
      ],
      correctIndex: 1,
      explanation:
        "SPY and VTI track different indexes with different holdings and methodologies. Practitioner consensus: not substantially identical. SPY → VOO would be much riskier (both track the S&P 500, possibly identical).",
    },
    {
      question: "What's the practical scope of the wash-sale window?",
      options: [
        "30 days after the sale only",
        "30 days before the sale only",
        "30 days BEFORE AND 30 days AFTER (61-day window total, including the sale day)",
        "60 days only after the sale",
      ],
      correctIndex: 2,
      explanation:
        "Both directions. Buying replacements within 30 days BEFORE the loss sale also triggers it. This is why year-end harvesting + January re-buys are still wash sales — the calendar boundary doesn't reset the window.",
    },
    {
      question: "How does a §475(f) MTM election change wash-sale exposure?",
      options: [
        "Wash sales become more strict",
        "MTM electors are exempt from §1091 entirely for trading positions",
        "Wash sales still apply but at a reduced rate",
        "MTM has no effect on wash sales",
      ],
      correctIndex: 1,
      explanation:
        "§475(f) MTM electors don't have wash sales on their trading activity — every loss is immediately recognized as ordinary income. This is a meaningful operational benefit beyond just the loss-limit removal.",
    },
  ],

  // ─── Quarterly Estimated Taxes ──────────────────────────────────────
  "quarterly-estimated-taxes-for-traders": [
    {
      question:
        "Which is a valid 'safe harbor' to avoid §6654 underpayment penalties?",
      options: [
        "Pay at least $5,000 by April 15",
        "Pay at least 90% of current-year tax OR 100% of prior-year tax (110% if prior AGI > $150K)",
        "Pay any amount before December 31",
        "File an extension",
      ],
      correctIndex: 1,
      explanation:
        "Either path works. For traders with volatile income, the prior-year safe harbor is huge — pay 100%/110% of last year's tax in equal quarters and you can owe $200K extra at filing without penalty.",
    },
    {
      question:
        "Why is W-2 withholding often easier than quarterly estimates?",
      options: [
        "Withholding is tax-exempt",
        "Withholding is treated as paid evenly across the year regardless of when it was actually withheld",
        "Withholding has lower rates",
        "Estimates require an attorney",
      ],
      correctIndex: 1,
      explanation:
        "Critical asymmetry: a December W-2 withholding bump can fix Q1-Q3 underpayment retroactively. Quarterly estimates are cash-basis and time-stamped — Q1 underpayment can't be cured by a Q4 estimate.",
    },
    {
      question: "When is Q4 estimated tax due?",
      options: [
        "December 31",
        "January 15 of the following year",
        "April 15 of the following year",
        "October 15",
      ],
      correctIndex: 1,
      explanation:
        "Q4 deadline is January 15 of the next year. Q1: April 15. Q2: June 15 (only 2 months covered). Q3: September 15. Q4: January 15.",
    },
    {
      question: "What does EFTPS provide that Form 1040-ES vouchers don't?",
      options: [
        "Lower tax rates",
        "Immediate IRS approval",
        "Free, scheduled, and reliable electronic payments with payment history — no postal mishaps",
        "Automatic safe-harbor calculation",
      ],
      correctIndex: 2,
      explanation:
        "EFTPS is the IRS's free electronic payment system. One-time enrollment (PIN comes by mail — set up in advance), then schedule payments months ahead. Most active traders use EFTPS or IRS Direct Pay.",
    },
    {
      question: "Are quarterly estimated tax periods of equal length?",
      options: [
        "Yes, three months each",
        "No — Q1 and Q3 cover 3 months, Q2 covers only 2 months (April-May), Q4 covers 4 months",
        "Yes, all 90 days",
        "No, they vary by income level",
      ],
      correctIndex: 1,
      explanation:
        "The quarters are NOT equal calendar periods. Q1 = 3 mo, Q2 = 2 mo, Q3 = 3 mo, Q4 = 4 mo. Most traders just split safe-harbor evenly across the four payments and ignore the irregularity.",
    },
  ],

  // ─── Estate Planning Basics ─────────────────────────────────────────
  "estate-planning-basics": [
    {
      question: "What's the most-overlooked fact in estate planning?",
      options: [
        "Wills must be signed in blue ink",
        "Beneficiary designations on retirement and life insurance OVERRIDE the will",
        "Only married people need wills",
        "Estate tax applies to all estates",
      ],
      correctIndex: 1,
      explanation:
        "401(k), IRA, life insurance, and TOD/POD-titled accounts pass directly to the named beneficiary regardless of what the will says. Update designations after every major life event — divorce, marriage, birth.",
    },
    {
      question: "What is 'step-up in basis' and why does it matter?",
      options: [
        "A required minimum distribution adjustment",
        "When you inherit appreciated assets, the cost basis resets to FMV at the date of death — eliminating capital gains on lifetime appreciation",
        "A penalty for early IRA withdrawal",
        "An increase in the federal exemption",
      ],
      correctIndex: 1,
      explanation:
        "Parent buys stock at $10K, dies when worth $200K, heir's basis is $200K — the $190K of lifetime appreciation is never taxed. This is a major reason elderly investors hold appreciated positions until death.",
    },
    {
      question: "Which document set covers the basics for most adults?",
      options: [
        "Just a will",
        "Will, durable financial POA, healthcare POA / advance directive, and a HIPAA release",
        "Living trust + LLC + private foundation",
        "Beneficiary designations only",
      ],
      correctIndex: 1,
      explanation:
        "Will (assets + guardianship), durable POA (financial decisions during incapacity), healthcare POA (medical decisions), HIPAA release (medical record access). For most middle-class estates, this is sufficient.",
    },
    {
      question: "When is a revocable living trust genuinely useful?",
      options: [
        "For everyone who wants probate avoidance",
        "Real estate in multiple states, privacy concerns, large estates near the federal exemption, special-needs / spendthrift beneficiaries, second marriages with prior children",
        "When you have a small estate",
        "For tax savings on income",
      ],
      correctIndex: 1,
      explanation:
        "Trusts are sold aggressively but the genuine use cases are narrower than marketed. Most people only need a will + designations; trusts make sense for specific structural needs.",
    },
    {
      question: "What's the 3-year ILIT lookback?",
      options: [
        "ILITs must file taxes for 3 years before funding",
        "Transferring an EXISTING policy into an ILIT pulls it back into your estate if death occurs within 3 years (§2035)",
        "The federal exemption resets every 3 years",
        "Probate lasts 3 years for ILITs",
      ],
      correctIndex: 1,
      explanation:
        "§2035 lookback. To avoid: have the ILIT PURCHASE a new policy from day one, never transfer an existing one in unless you have certainty of 3+ years.",
    },
  ],

  // ─── Roth Conversion Ladder ─────────────────────────────────────────
  "roth-conversion-ladder": [
    {
      question: "What does the Roth Conversion Ladder solve?",
      options: [
        "Eliminates RMDs entirely",
        "Lets early retirees access traditional retirement money before 59½ without the 10% penalty",
        "Removes income limits on Roth contributions",
        "Doubles the contribution limit",
      ],
      correctIndex: 1,
      explanation:
        "The ladder converts traditional IRA money to Roth in low-income years; after a 5-year clock per conversion, the principal becomes withdrawable penalty-free regardless of age. Bridges the pre-59½ gap.",
    },
    {
      question: "How long is the wait between converting and being able to withdraw the principal penalty-free?",
      options: [
        "1 year",
        "3 years",
        "5 years (per individual conversion)",
        "10 years",
      ],
      correctIndex: 2,
      explanation:
        "Each conversion has its own independent 5-year clock starting January 1 of the conversion year. By staggering conversions, you build a continuous stream of penalty-free withdrawals.",
    },
    {
      question: "Which year is best for doing a large Roth conversion?",
      options: [
        "Your highest-income year — when you can afford the tax",
        "Your lowest-income year (gap year, sabbatical, year after retiring)",
        "The year you turn 59½",
        "Conversions are taxed the same regardless of timing",
      ],
      correctIndex: 1,
      explanation:
        "Conversions fill brackets from your existing income upward. Doing them in low-income years means they fill the 10%/12% brackets cheaply. High-income years would put them in 24%+ brackets — defeats the purpose.",
    },
    {
      question: "What's a major hidden cost of large conversions in your 60s?",
      options: [
        "Wash sale violations",
        "IRMAA (Medicare surcharges) triggered 2 years later by elevated MAGI",
        "Loss of Social Security entirely",
        "Mandatory state tax doubling",
      ],
      correctIndex: 1,
      explanation:
        "IRMAA looks at MAGI from 2 years ago. A conversion that pushes 2024 MAGI past a threshold can cost $1,000+/yr in 2026 Medicare premiums. Plan conversions around the IRMAA brackets.",
    },
    {
      question: "When is Rule 72(t) (SEPP) a better choice than the Roth Ladder?",
      options: [
        "When you have plenty of taxable savings to bridge",
        "When you can&apos;t afford the 5-year wait or have only IRAs (no taxable balance)",
        "When you want to maximize estate tax savings",
        "When you live in a no-income-tax state",
      ],
      correctIndex: 1,
      explanation:
        "72(t) penalty-free SEPP requires committing to fixed payments for 5 years OR until 59½. It locks you in but works without a brokerage bridge. The ladder is more flexible if you can afford the 5-year wait.",
    },
  ],

  // ─── Asset Location ─────────────────────────────────────────────────
  "asset-location-strategy": [
    {
      question: "What's the difference between asset allocation and asset location?",
      options: [
        "They&apos;re the same thing",
        "Allocation = how much of each asset class; location = which account each lives in",
        "Allocation is for stocks, location is for bonds",
        "Location is the brokerage&apos;s headquarters",
      ],
      correctIndex: 1,
      explanation:
        "Allocation decides ratio (e.g., 80/20 stocks/bonds). Location decides which account holds each piece. They&apos;re independent decisions and both matter.",
    },
    {
      question: "Which asset class belongs in tax-deferred accounts?",
      options: [
        "Broad market index funds (low turnover, qualified dividends)",
        "Bonds (yield is taxed as ordinary income — biggest tax drag)",
        "Cash",
        "Individual stocks held long-term",
      ],
      correctIndex: 1,
      explanation:
        "Bond interest is taxed as ordinary income — same rate as wages. Sheltering it in a Traditional IRA / 401(k) defers the tax. Index funds are inherently tax-efficient and fit better in taxable.",
    },
    {
      question: "Why prioritize highest-growth assets in Roth?",
      options: [
        "Roth has higher contribution limits",
        "Roth growth is tax-free forever; maximize the value of that wrapper with assets that compound aggressively",
        "It&apos;s legally required",
        "Roth distributions count toward RMDs",
      ],
      correctIndex: 1,
      explanation:
        "Every dollar of growth in a Roth is tax-free forever. Putting low-return bonds there wastes the most valuable real estate in your portfolio. Reserve it for high-expected-return assets like small caps or aggressive growth.",
    },
    {
      question: "Approximately how much can optimal asset location add to after-tax returns annually?",
      options: [
        "0–5 bps",
        "30–100 bps (compounds to 6-figure differences over 30 years)",
        "200–500 bps",
        "It always reduces returns",
      ],
      correctIndex: 1,
      explanation:
        "Studies estimate 30-100 basis points of annual after-tax improvement from optimal location. Compounded over decades, that&apos;s the difference between $1M and $1.4M on the same $500K starting balance.",
    },
    {
      question:
        "What rebalancing approach minimizes tax cost?",
      options: [
        "Sell appreciated holdings in taxable to buy underweight assets",
        "Rebalance ACROSS accounts: sell overweighted assets in tax-deferred (no tax) instead of triggering capital gains in taxable",
        "Don&apos;t rebalance",
        "Rebalance only at year-end",
      ],
      correctIndex: 1,
      explanation:
        "Cross-account rebalancing leverages the fact that sells inside a Traditional IRA / 401(k) are tax-free (deferred). Save the taxable account for new contributions and avoid triggering capital gains.",
    },
  ],

  // ─── Social Security Claiming Strategies ────────────────────────────
  "social-security-claiming-strategies": [
    {
      question: "What's the maximum age you can delay claiming Social Security and still get bigger benefits?",
      options: [
        "65",
        "Full Retirement Age (67)",
        "70 — no further increases past 70",
        "75",
      ],
      correctIndex: 2,
      explanation:
        "Delayed retirement credits accrue at +8%/yr from FRA to age 70, then stop. Claiming past 70 gives you no extra benefit — file by 70.",
    },
    {
      question: "Why does delaying to 70 usually win mathematically?",
      options: [
        "It&apos;s required by law",
        "You get a guaranteed +8%/yr inflation-adjusted boost — no other risk-free 8% return exists, and break-even is ~age 80 (well before average life expectancy)",
        "Lower taxes on benefits",
        "Higher employer match",
      ],
      correctIndex: 1,
      explanation:
        "+8%/yr COLA-adjusted is unmatched anywhere else. With break-even ~80 and life expectancy 84-87 from age 65, the math favors delay for anyone with reasonable longevity.",
    },
    {
      question: "How do spousal vs survivor benefits differ?",
      options: [
        "They&apos;re the same thing",
        "Spousal = up to 50% of partner&apos;s PIA at FRA (capped); survivor = full benefit deceased was receiving (including any delayed credits)",
        "Spousal is always larger",
        "Survivor only applies to remarried widows",
      ],
      correctIndex: 1,
      explanation:
        "Spousal caps at 50% of partner&apos;s PIA — delaying spousal past FRA does NOT increase it. Survivor benefits inherit the full amount including delayed credits — which is why the higher earner often delays to maximize the survivor benefit.",
    },
    {
      question: "What's the Roth conversion / Social Security synergy?",
      options: [
        "Roth conversions increase your SS benefit",
        "Roth withdrawals don&apos;t count toward 'combined income' for SS taxation, so doing conversions BEFORE claiming reduces future SS taxation and uses low brackets cheaply",
        "Conversions reduce SS premiums",
        "There&apos;s no relationship",
      ],
      correctIndex: 1,
      explanation:
        "Combined income (used to determine SS taxability) excludes Roth withdrawals. Pre-claim Roth conversions in your 60s fill low brackets AND reduce post-claim SS taxation. Powerful pairing.",
    },
    {
      question: "What's IRMAA?",
      options: [
        "An IRS form",
        "Means-tested Medicare surcharge based on MAGI from 2 years prior — can add $70-$447/month to Part B premiums",
        "A tax-free retirement account",
        "Insurance for early retirees",
      ],
      correctIndex: 1,
      explanation:
        "Income-Related Monthly Adjustment Amount. Tier-based surcharges on Medicare Part B/D premiums kicked in by income. Lookback is 2 years — a single Roth conversion that pushes MAGI past a threshold can cost $1,000+/yr in higher premiums.",
    },
  ],
};

/** Lookup helper — returns undefined for guides without a quiz. */
export function getQuizForGuide(slug: string) {
  return QUIZZES[slug];
}
