"use client";

// Dedicated /pricing page. Sister of the #pricing teaser on the
// landing (kept there so visitors scrolling the landing still get
// the basics); this page is the canonical source-of-truth for full
// tier details — feature-comparison matrix + FAQ + Get-in-touch CTA.
//
// Uses the same `ld-*` landing design tokens as src/app/page.tsx so
// the visual identity stays consistent. The nav and footer are the
// shared SiteNav and SiteFooter.

import Link from "next/link";
import { Fragment, useState } from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import { SiteNav, LANDING_NAV_LINKS_ABSOLUTE } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Segmented } from "@/components/ui/segmented";

type PlanKey = "free" | "trader" | "premium" | "selfHosted";

/** The comparison's columns, in table order. */
const PLANS: { key: PlanKey; label: string }[] = [
  { key: "free", label: "Free" },
  { key: "trader", label: "Trader" },
  { key: "premium", label: "Premium" },
  { key: "selfHosted", label: "Self-hosted" },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  // Below sm the comparison shows one plan at a time instead of a table
  // that scrolls sideways; Trader is the plan most readers came for.
  const [phonePlan, setPhonePlan] = useState<PlanKey>("trader");

  // ─── Tier cards (kept in sync with landing teaser) ──────────────────
  //
  // Four-tier structure (2026-05-14 restructuring):
  //   Free        — hosted, public-data only, no engine, no AI, no
  //                 paid-API features. The 'I want to look around'
  //                 entry point.
  //   Trader $20  — full platform as it exists today, minus AI
  //                 (every Finnhub feature, full engine, GA optimizer,
  //                 adaptive mode, multi-broker, journal, tax, etc.)
  //   Premium $40 — Trader + AI assistant + future paid-data tier
  //                 (L2 / real-time SIP / dark pools shipping later)
  //   Self-Hosted — source-available under FSL-1.1, BYO everything.
  //                (Renamed from "Open Source" 2026-05-14 — FSL is
  //                technically source-available, not OSI-approved
  //                open source, until each commit auto-converts to
  //                Apache 2.0 at 2 years.)
  const tiers = [
    {
      name: "Free",
      tag: "Hosted",
      price: "$0",
      cadence: "",
      annual: "Public data + education",
      desc: "Browse, learn, research. No trading.",
      features: [
        "All 14 education guides + 95 glossary terms",
        "8 financial calculators",
        "Congressional trades feed",
        "Reddit ticker mentions",
        "SEC filings + earnings calendar",
        "Basic watchlist (1 list, 10 symbols)",
        "Read-only community access",
        "No trading engine, no AI",
      ],
      cta: "Sign up free",
      ctaHref: "/register",
      highlight: false,
    },
    {
      name: "Trader",
      tag: "Most popular",
      price: "$20",
      cadence: "/ month",
      annual: "$200/yr — saves 2 months",
      desc: "The full platform without AI features.",
      features: [
        "Full engine (paper + live trading)",
        "All 8 engine modes including adaptive",
        "Genetic-algorithm optimizer",
        "Multi-broker (up to 3 connections)",
        "Hybrid signal pipeline (sentiment + options + analyst)",
        "Audit log + tax center + journal",
        "Unlimited watchlists + alerts",
        "Full community access",
      ],
      cta: "Start with Trader",
      ctaHref: "/register?plan=trader&cadence=month",
      highlight: true,
    },
    {
      name: "Premium",
      tag: "AI + future data",
      price: "$40",
      cadence: "/ month",
      annual: "$400/yr — saves 2 months",
      desc: "Trader + AI assistant + premium data (coming).",
      features: [
        "Everything in Trader, plus:",
        "AI chat assistant (Groq Llama 3.3)",
        "AI-scored signal layer",
        "AI weekly trade-journal review",
        "Daily AI market digest",
        "L2 / order book data (when available)",
        "Real-time SIP feed (when available)",
        "Dark pool data (when available)",
      ],
      cta: "Step up to Premium",
      ctaHref: "/register?plan=premium&cadence=month",
      highlight: false,
    },
    {
      name: "Self-Hosted",
      tag: "Source-available",
      price: "Free",
      cadence: "",
      annual: "Your data, your hardware",
      desc: "BYO Postgres + broker + paid API keys.",
      features: [
        "Source code on GitHub (FSL-1.1)",
        "Same engine, your control",
        "BYO Finnhub + Groq + broker keys",
        "No telemetry, no SaaS lock-in",
        "Privacy-first deployments",
        "Self-managed updates",
        "Auto-converts to Apache 2.0 after 2 years",
        "Community Discord access",
      ],
      cta: "View on GitHub",
      ctaHref: "https://github.com/beacontry/Sentinel",
      highlight: false,
    },
  ];

  // ─── Feature comparison matrix ───────────────────────────────────────
  // Categories with rows. Each row shows which tiers include the feature.
  // Values: true (✓), false (—), or a string (e.g. "1" / "3" / "Unlimited").
  type Cell = boolean | string;
  type Row = { label: string } & Record<PlanKey, Cell>;
  type Category = { name: string; rows: Row[] };

  const matrix: Category[] = [
    {
      name: "Trading engine",
      rows: [
        { label: "Paper trading",                free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Live trading",                 free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Broker connections",           free: false, trader: "3",   premium: "3",  selfHosted: "Unlimited" },
        { label: "Genetic-algorithm optimizer",  free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Adaptive (regime-driven) mode", free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "All 8 engine modes",           free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Strategy builder + presets",   free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Backtest (single + compare)",  free: "Limited", trader: true, premium: true, selfHosted: true },
      ],
    },
    {
      name: "Data sources",
      rows: [
        { label: "Yahoo daily bars (public)",    free: true,  trader: true,  premium: true, selfHosted: true  },
        { label: "Reddit ticker mentions",       free: true,  trader: true,  premium: true, selfHosted: true  },
        { label: "Congressional trades",         free: true,  trader: true,  premium: true, selfHosted: true  },
        { label: "SEC filings + earnings cal",   free: true,  trader: true,  premium: true, selfHosted: true  },
        { label: "Headline sentiment (local)",   free: true,  trader: true,  premium: true, selfHosted: true  },
        { label: "Finnhub news + sentiment",     free: false, trader: true,  premium: true, selfHosted: "BYO key" },
        { label: "Fundamentals + analyst recs",  free: false, trader: true,  premium: true, selfHosted: "BYO key" },
        { label: "Insider transactions",         free: false, trader: true,  premium: true, selfHosted: "BYO key" },
        { label: "Options flow + unusual vol",   free: false, trader: true,  premium: true, selfHosted: "BYO key" },
        { label: "L2 / order book (coming)",     free: false, trader: false, premium: "Roadmap", selfHosted: false },
        { label: "Real-time SIP feed (coming)",  free: false, trader: false, premium: "Roadmap", selfHosted: false },
        { label: "Dark pool data (coming)",      free: false, trader: false, premium: "Roadmap", selfHosted: false },
      ],
    },
    {
      name: "AI features",
      rows: [
        { label: "AI chat assistant",            free: false, trader: false, premium: true, selfHosted: "BYO key" },
        { label: "AI signal scoring (hybrid)",   free: false, trader: false, premium: true, selfHosted: "BYO key" },
        { label: "AI weekly journal review",     free: false, trader: false, premium: true, selfHosted: "BYO key" },
        { label: "Daily AI market digest",       free: false, trader: false, premium: true, selfHosted: "BYO key" },
        { label: "AI trade summaries",           free: false, trader: false, premium: true, selfHosted: "BYO key" },
      ],
    },
    {
      name: "Risk + compliance",
      rows: [
        { label: "Per-user risk profile",        free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Trailing-stop sync to broker", free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Wash-sale protection / MTM",   free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Account-switch detection",     free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Daily notional cap",           free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Hash-chained audit log",       free: false, trader: "View", premium: "View + verify", selfHosted: "Full access" },
        { label: "MFA + encrypted credentials",  free: true,  trader: true,  premium: true, selfHosted: true  },
      ],
    },
    {
      name: "Productivity",
      rows: [
        { label: "Education hub + spaced-rep",   free: true,  trader: true,  premium: true, selfHosted: true  },
        { label: "Financial calculators (8)",    free: true,  trader: true,  premium: true, selfHosted: true  },
        { label: "Multi-watchlist + sharing",    free: "1 list / 10 sym", trader: "Unlimited", premium: "Unlimited", selfHosted: "Unlimited" },
        { label: "Trade journal (auto-stub)",    free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Tax center (Form 8949)",       free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Saved strategy library",       free: false, trader: true,  premium: true, selfHosted: true  },
        { label: "Performance attribution",      free: false, trader: true,  premium: true, selfHosted: true  },
      ],
    },
    {
      name: "Community + support",
      rows: [
        { label: "Forum + posts + leaderboard",  free: "Read",  trader: true,  premium: true, selfHosted: false },
        { label: "Private messages",             free: false,   trader: true,  premium: true, selfHosted: false },
        { label: "Discord webhook alerts",       free: false,   trader: true,  premium: true, selfHosted: true  },
        { label: "Email support",                free: false,   trader: true,  premium: true, selfHosted: false },
        { label: "Priority support",             free: false,   trader: false, premium: true, selfHosted: false },
        { label: "Community Discord access",     free: true,    trader: true,  premium: true, selfHosted: true  },
      ],
    },
  ];

  function renderCell(value: Cell) {
    if (value === true)
      return (
        <>
          <Check className="mx-auto h-4 w-4 text-ld-accent" aria-hidden="true" />
          <span className="sr-only">Included</span>
        </>
      );
    if (value === false)
      return (
        <>
          <Minus className="mx-auto h-4 w-4 text-ld-text-muted opacity-50" aria-hidden="true" />
          <span className="sr-only">Not included</span>
        </>
      );
    return <span className="text-sm text-ld-text-secondary">{value}</span>;
  }

  // ─── FAQ ────────────────────────────────────────────────────────────
  const faqs = [
    {
      id: "what-is-free",
      q: "What's actually free on the Free tier?",
      a: "All public-data features. You can read every guide in the education hub (14 long-form guides, 95 glossary terms, 8 financial calculators), browse Congressional trades, see Reddit ticker mentions, view SEC filings + the earnings calendar, and keep a small watchlist (1 list, up to 10 symbols) backed by Yahoo daily bars. You can read community forum posts. You CANNOT trade (no engine), use Finnhub-powered features (news + sentiment + fundamentals + options flow + insiders), or use AI features. The Free tier is for learning + research + watching Congress trades.",
    },
    {
      id: "trader-vs-premium",
      q: "What's the difference between Trader and Premium?",
      a: "Trader ($20/mo) is the full platform as it exists today, minus AI. That's the engine (paper + live), all 8 modes including adaptive, GA optimizer, multi-broker, Finnhub data (news + sentiment + fundamentals + options + insiders), journal, tax center, audit log — everything. Premium ($40/mo) is Trader + AI assistant (chat, signal scoring, weekly review, daily digest, trade summaries) + future premium-data features (L2 / real-time SIP / dark pools) when they ship. If you don't want AI-summarized analysis, Trader is right. If you want the assistant talking to you about your trades + reading premium data when we land it, Premium is right.",
    },
    {
      id: "switch",
      q: "Can I switch tiers later?",
      a: "Yes — upgrade or downgrade anytime. Upgrades are prorated to the current billing cycle; downgrades take effect at the start of the next cycle. Downgrading from Premium to Trader pauses AI features at the next renewal but keeps your data intact.",
    },
    {
      id: "trial",
      q: "Is there a free trial?",
      a: "Two ways to try. The Free tier is permanent — sign up, browse the education hub + public feeds (Congressional trades, SEC filings, daily digest), keep a 10-symbol watchlist. No card required, no expiry. When you're ready to trade, both paid plans (Trader $20/mo and Premium $40/mo) include a 7-day free trial — cancel anytime in the first 7 days and you won't be charged. Beyond the trial, the first 30 days are still fully refundable, no questions asked.",
    },
    {
      id: "broker",
      q: "Do I need to bring my own broker?",
      a: "Yes — Beacontry never custodies assets. Connect your existing Alpaca, Tradier, or Interactive Brokers account via API keys we encrypt at rest with AES-256-GCM. You can run paper trading with the Alpaca free tier if you don't want to wire up a live broker yet.",
    },
    {
      id: "future-data",
      q: "When do L2 / real-time / dark pool data land?",
      a: "These are on the Premium tier roadmap. Real-time SIP feeds run $100-200/mo per data provider for the underlying license; we'll ship as the user base supports the underlying spend. Premium subscribers get them automatically when they land — no price bump.",
    },
    {
      id: "self-host",
      q: "Can I self-host commercially?",
      a: "Personal use, internal company use, dev/research/educational use — all free under the Functional Source License (FSL-1.1). Self-hosting Beacontry as a competing commercial service (offering it to others as a paid trading platform) requires a commercial license from us. Email hello@beacontry.com if that's your use case. Each release auto-converts to Apache 2.0 after 2 years.",
    },
    {
      id: "byo-keys",
      q: "If I self-host, what API keys do I need to bring?",
      a: "At minimum: a broker (Alpaca paper-free / Alpaca-live / Tradier / IBKR). For full features, you'll also want Finnhub (news, sentiment, fundamentals, options, insiders) and Groq (AI). Every API key is encrypted in your local database; you control the keys. You can also disable Finnhub or AI features entirely if you want — the engine still works on Yahoo bars + headline sentiment alone.",
    },
    {
      id: "tax",
      q: "Does Beacontry handle taxes?",
      a: "Beacontry generates Form 8949 + tracks FIFO realized gains + wash-sale flags (or honors §475(f) MTM election if you've filed one). It is NOT a tax filing service or a registered tax professional. Verify with your CPA before filing.",
    },
  ];

  return (
    <div className="min-h-screen bg-ld-deep font-[family-name:var(--font-display)] text-ld-text">
      <SiteNav links={LANDING_NAV_LINKS_ABSOLUTE} active="pricing" />

      {/* ── Hero ── */}
      <section className="pt-36 pb-16 lg:pt-40">
        <div className="animate-fade-in-up mx-auto max-w-[760px] px-4 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ld-accent">{"// pricing"}</p>
          <h1 className="text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold leading-[1.05] tracking-tighter">
            Simple pricing. Real power.
          </h1>
          <p className="mx-auto mt-5 max-w-[640px] text-lg leading-relaxed text-ld-text-secondary">
            Bring your own broker. Annual saves ~17%. Cancel anytime. Open-source
            and self-hostable forever if you want full control.
          </p>
        </div>
      </section>

      {/* ── Tier cards ── */}
      <section className="pb-20">
        <div className="mx-auto grid max-w-[1280px] items-stretch gap-5 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-7">
          {tiers.map((tier, i) => (
            <article
              key={tier.name}
              className={`animate-fade-in-up stagger-${i + 1} relative flex flex-col rounded-xl border bg-ld-card p-8 transition-[background-color,border-color,color,translate,box-shadow] duration-250 hover:-translate-y-1 hover:shadow-pop ${
                tier.highlight
                  ? "border-ld-accent/40 ring-1 ring-ld-accent/20"
                  : "border-ld-border hover:border-ld-border-accent"
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ld-accent px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-ld-on-accent">
                  {tier.tag}
                </div>
              )}
              {!tier.highlight && (
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-ld-text-muted">{tier.tag}</p>
              )}

              <h3 className="mt-3 text-xl font-bold">{tier.name}</h3>
              <p className="mt-2 text-base text-ld-text-secondary">{tier.desc}</p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold leading-none">{tier.price}</span>
                {tier.cadence && <span className="text-ld-text-muted">{tier.cadence}</span>}
              </div>
              <p className="mt-1 text-xs text-ld-text-muted">{tier.annual}</p>

              <ul className="mt-6 flex-1 space-y-2.5 text-base">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-ld-text-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ld-accent" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={tier.ctaHref}
                className={`mt-8 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-base font-semibold transition-[background-color,border-color,color,translate,box-shadow] duration-200 hover:-translate-y-0.5 ${
                  tier.highlight
                    ? "bg-ld-accent text-ld-on-accent hover:bg-ld-accent-dim hover:shadow-pop"
                    : "border border-ld-border text-ld-text hover:border-ld-accent hover:bg-ld-accent/[0.06]"
                }`}
              >
                {tier.cta} {tier.name !== "Self-Hosted" && <ArrowRight className="h-4 w-4" />}
              </Link>
            </article>
          ))}
        </div>

      </section>

      {/* ── Feature comparison matrix ── */}
      <section className="bg-ld-panel py-24">
        <div className="animate-fade-in-up mx-auto mb-12 max-w-[760px] px-4 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ld-accent">{"// detailed comparison"}</p>
          <h2 className="text-[clamp(1.7rem,3.5vw,2.4rem)] font-bold leading-tight tracking-tight">
            What&apos;s in each tier
          </h2>
        </div>

        <div className="mx-auto max-w-[1100px] px-4 lg:px-7">
          {/* Phone: one plan at a time, every feature stacked under it. A
              five-column table cannot fit 360px without scrolling sideways. */}
          <div className="sm:hidden">
            <Segmented
              options={PLANS.map((p) => ({ value: p.key, label: p.label }))}
              value={phonePlan}
              onChange={setPhonePlan}
              label="Plan to show"
              fullWidth
              twoUpOnPhone
            />
            <div className="mt-4 overflow-hidden rounded-xl border border-ld-border bg-ld-card">
              {matrix.map((category) => (
                <div key={category.name}>
                  <h3 className="border-b border-ld-border/60 bg-ld-deep/30 px-4 py-2.5 text-xs font-mono uppercase tracking-[0.1em] text-ld-accent">
                    {category.name}
                  </h3>
                  <dl>
                    {category.rows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-4 border-b border-ld-border/30 px-4 py-3"
                      >
                        <dt className="min-w-0 text-base text-ld-text-secondary">{row.label}</dt>
                        <dd className="shrink-0 text-right">{renderCell(row[phonePlan])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-ld-border bg-ld-card sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                {/* Sticky header */}
                <thead>
                  <tr className="border-b border-ld-border bg-ld-panel/60">
                    <th className="w-[36%] px-5 py-4 text-xs font-mono uppercase tracking-[0.1em] text-ld-text-muted">
                      Feature
                    </th>
                    <th className="px-3 py-4 text-center text-xs font-mono uppercase tracking-[0.1em] text-ld-text-secondary">
                      Free
                    </th>
                    <th className="px-3 py-4 text-center text-xs font-mono uppercase tracking-[0.1em] text-ld-accent">
                      Trader
                    </th>
                    <th className="px-3 py-4 text-center text-xs font-mono uppercase tracking-[0.1em] text-ld-accent">
                      Premium
                    </th>
                    <th className="px-3 py-4 text-center text-xs font-mono uppercase tracking-[0.1em] text-ld-text-secondary">
                      Self-hosted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((category) => (
                    <Fragment key={category.name}>
                      {/* Category divider */}
                      <tr className="border-b border-ld-border/60 bg-ld-deep/30">
                        <td colSpan={5} className="px-5 py-2.5 text-xs font-mono uppercase tracking-[0.1em] text-ld-accent">
                          {category.name}
                        </td>
                      </tr>
                      {category.rows.map((row, ri) => (
                        <tr
                          key={`${category.name}-${ri}`}
                          className="border-b border-ld-border/30 last:border-b-0 hover:bg-ld-panel/40"
                        >
                          <td className="px-5 py-3 text-base text-ld-text-secondary">
                            {row.label}
                          </td>
                          <td className="px-3 py-3 text-center">{renderCell(row.free)}</td>
                          <td className="px-3 py-3 text-center">{renderCell(row.trader)}</td>
                          <td className="px-3 py-3 text-center">{renderCell(row.premium)}</td>
                          <td className="px-3 py-3 text-center">{renderCell(row.selfHosted)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-ld-text-muted">
            All features available on every tier unless otherwise marked. Self-hosted runs on your own infrastructure with full FSL-1.1 source.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24">
        <div className="animate-fade-in-up mx-auto mb-12 max-w-[760px] px-4 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ld-accent">{"// faq"}</p>
          <h2 className="text-[clamp(1.7rem,3.5vw,2.4rem)] font-bold leading-tight tracking-tight">
            Common questions
          </h2>
        </div>

        <div className="mx-auto max-w-[820px] space-y-3 px-4 lg:px-7">
          {faqs.map((faq) => {
            const open = openFaq === faq.id;
            return (
              <div
                key={faq.id}
                className={`overflow-hidden rounded-xl border bg-ld-card transition-colors ${
                  open ? "border-ld-accent/30" : "border-ld-border hover:border-ld-border-accent"
                }`}
              >
                <button
                  onClick={() => setOpenFaq(open ? null : faq.id)}
                  className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
                  aria-expanded={open}
                >
                  <span className="text-base font-semibold text-ld-text">{faq.q}</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ld-border text-ld-text-secondary transition-transform duration-200 ${open ? "rotate-45 border-ld-accent text-ld-accent" : ""}`}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </button>
                {open && (
                  <div className="border-t border-ld-border/40 px-6 pb-5 pt-4 text-base leading-relaxed text-ld-text-secondary">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-ld-panel py-24">
        <div className="animate-fade-in-up mx-auto max-w-[660px] px-4 text-center">
          <h2 className="text-[clamp(1.7rem,3.5vw,2.4rem)] font-bold leading-tight tracking-tight">
            Ready to start watching?
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-lg leading-relaxed text-ld-text-secondary">
            Free tier is permanent — sign up in 30 seconds, no card required.
            Upgrade to Trader or Premium when you&apos;re ready to trade, both
            with a 7-day free trial.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-ld-accent px-8 py-4 text-base font-semibold text-ld-on-accent transition-[background-color,border-color,color,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-ld-accent-dim hover:shadow-pop">
              Sign up free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/register?plan=trader&cadence=month" className="rounded-lg border border-ld-border px-8 py-4 text-base font-semibold text-ld-text transition-[background-color,border-color,color,translate] duration-200 hover:-translate-y-0.5 hover:border-ld-accent hover:bg-ld-accent/[0.06]">
              Start Trader trial
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
