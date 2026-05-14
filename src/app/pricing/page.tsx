"use client";

// Dedicated /pricing page. Sister of the #pricing teaser on the
// landing (kept there so visitors scrolling the landing still get
// the basics); this page is the canonical source-of-truth for full
// tier details — feature-comparison matrix + FAQ + Get-in-touch CTA.
//
// Uses the same `ld-*` landing design tokens as src/app/page.tsx so
// the visual identity stays consistent. Navbar duplicated inline
// rather than extracted to a shared component — only two pages need
// it; extraction can come later if we add more public pages.

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import { ThemePicker } from "@/components/theme-picker";
import { BeacontryMark } from "@/components/brand/beacontry-mark";

export default function PricingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: "Features", href: "/#features" },
    { label: "How It Works", href: "/#process" },
    { label: "Pricing", href: "/pricing" },
    { label: "Why Beacontry", href: "/#trust" },
  ];

  // ─── Tier cards (same as landing, kept in sync) ─────────────────────
  const tiers = [
    {
      name: "Trader",
      tag: "Most popular",
      price: "$29",
      cadence: "/ month",
      annual: "$290/yr — saves 2 months",
      desc: "Everything an active retail trader needs.",
      features: [
        "Full engine (paper + live trading)",
        "Unlimited watchlists",
        "All education + spaced-rep review",
        "Alerts: push, email, Discord",
        "TradingView + Reddit + Congress feeds",
        "Tax center + automated journal",
        "1 broker connection",
      ],
      cta: "Start with Trader",
      ctaHref: "/register",
      highlight: true,
    },
    {
      name: "Pro",
      tag: "Power users",
      price: "$79",
      cadence: "/ month",
      annual: "$790/yr — saves 2 months",
      desc: "GA optimizer + adaptive mode + multi-broker.",
      features: [
        "Everything in Trader, plus:",
        "Adaptive (regime-driven) engine mode",
        "Genetic-algorithm strategy optimizer",
        "Multi-broker (up to 3 connections)",
        "Audit log access",
        "Priority email support",
        "Saved-strategy library",
      ],
      cta: "Step up to Pro",
      ctaHref: "/register",
      highlight: false,
    },
    {
      name: "Self-hosted",
      tag: "Open source",
      price: "Free",
      cadence: "",
      annual: "Your data, your hardware",
      desc: "Bring your own Postgres + Alpaca keys.",
      features: [
        "Full source code (FSL-1.1)",
        "No telemetry, no SaaS lock-in",
        "Self-managed updates",
        "Privacy-first deployments",
        "No SLA, no hosted support",
        "Same engine, your control",
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
  type Row = { label: string; trader: Cell; pro: Cell; selfHosted: Cell };
  type Category = { name: string; rows: Row[] };

  const matrix: Category[] = [
    {
      name: "Trading engine",
      rows: [
        { label: "Paper trading",                trader: true,  pro: true,  selfHosted: true  },
        { label: "Live trading",                 trader: true,  pro: true,  selfHosted: true  },
        { label: "Broker connections",           trader: "1",   pro: "3",   selfHosted: "Unlimited" },
        { label: "Genetic-algorithm optimizer",  trader: false, pro: true,  selfHosted: true  },
        { label: "Adaptive (regime-driven) mode", trader: false, pro: true,  selfHosted: true  },
        { label: "All 8 engine modes",           trader: true,  pro: true,  selfHosted: true  },
        { label: "Strategy builder + presets",   trader: true,  pro: true,  selfHosted: true  },
        { label: "Backtest (single + compare)",  trader: true,  pro: true,  selfHosted: true  },
      ],
    },
    {
      name: "Data sources",
      rows: [
        { label: "Real-time signals",            trader: true,  pro: true,  selfHosted: true  },
        { label: "Reddit ticker mentions",       trader: true,  pro: true,  selfHosted: true  },
        { label: "Congressional trades",         trader: true,  pro: true,  selfHosted: true  },
        { label: "SEC filings + earnings",       trader: true,  pro: true,  selfHosted: true  },
        { label: "News + sentiment analysis",    trader: true,  pro: true,  selfHosted: true  },
        { label: "Options flow + unusual volume", trader: true,  pro: true,  selfHosted: true  },
        { label: "AI scoring (Groq Llama 3.3)",  trader: true,  pro: true,  selfHosted: "BYO key" },
      ],
    },
    {
      name: "Risk + compliance",
      rows: [
        { label: "Per-user risk profile",        trader: true,  pro: true,  selfHosted: true  },
        { label: "Trailing-stop sync to broker", trader: true,  pro: true,  selfHosted: true  },
        { label: "PDT detection (sub-$25K)",     trader: true,  pro: true,  selfHosted: true  },
        { label: "Wash-sale protection / MTM",   trader: true,  pro: true,  selfHosted: true  },
        { label: "Account-switch detection",     trader: true,  pro: true,  selfHosted: true  },
        { label: "Daily notional cap",           trader: true,  pro: true,  selfHosted: true  },
        { label: "Hash-chained audit log",       trader: "View", pro: "View + verify", selfHosted: "Full access" },
        { label: "MFA + encrypted credentials",  trader: true,  pro: true,  selfHosted: true  },
      ],
    },
    {
      name: "Productivity",
      rows: [
        { label: "Multi-watchlist (named + shareable)", trader: true, pro: true, selfHosted: true },
        { label: "Trade journal (auto-stub + prompts)", trader: true, pro: true, selfHosted: true },
        { label: "AI weekly review",             trader: true,  pro: true,  selfHosted: "BYO key" },
        { label: "Tax center (Form 8949)",       trader: true,  pro: true,  selfHosted: true  },
        { label: "Saved strategy library",       trader: false, pro: true,  selfHosted: true  },
        { label: "Performance attribution",      trader: true,  pro: true,  selfHosted: true  },
        { label: "Education hub + spaced-rep",   trader: true,  pro: true,  selfHosted: true  },
      ],
    },
    {
      name: "Community + support",
      rows: [
        { label: "Forum + posts + leaderboard",  trader: true,  pro: true,  selfHosted: false },
        { label: "Private messages",             trader: true,  pro: true,  selfHosted: false },
        { label: "Discord webhook alerts",       trader: true,  pro: true,  selfHosted: true  },
        { label: "Daily AI market digest",       trader: true,  pro: true,  selfHosted: "BYO key" },
        { label: "Email support",                trader: true,  pro: true,  selfHosted: false },
        { label: "Priority email support",       trader: false, pro: true,  selfHosted: false },
        { label: "Community Discord access",     trader: true,  pro: true,  selfHosted: true  },
      ],
    },
  ];

  function renderCell(value: Cell) {
    if (value === true) return <Check className="mx-auto h-4 w-4 text-ld-accent" />;
    if (value === false) return <Minus className="mx-auto h-4 w-4 text-ld-text-muted opacity-50" />;
    return <span className="text-[0.86rem] text-ld-text-secondary">{value}</span>;
  }

  // ─── FAQ ────────────────────────────────────────────────────────────
  const faqs = [
    {
      id: "switch",
      q: "Can I switch tiers later?",
      a: "Yes — upgrade or downgrade anytime. Upgrades are prorated to the current billing cycle; downgrades take effect at the start of the next cycle.",
    },
    {
      id: "trial",
      q: "Is there a free trial?",
      a: "Beacontry is currently invite-only beta — public signup opens later. Join the waitlist on the landing page and you'll be notified when invites go out. Early users get the Trader tier free for the first 90 days.",
    },
    {
      id: "broker",
      q: "Do I need to bring my own broker?",
      a: "Yes — Beacontry never custodies assets. Connect your existing Alpaca, Tradier, or Interactive Brokers account via API keys we encrypt at rest with AES-256-GCM. You can run paper trading with Alpaca free tier if you don't want to wire up a live broker yet.",
    },
    {
      id: "trader-vs-pro",
      q: "What's the difference between Trader and Pro?",
      a: "Pro adds the genetic-algorithm strategy optimizer, the adaptive (regime-driven) engine mode, multi-broker connections (up to 3 instead of 1), audit log access, priority email support, and a saved-strategy library. If you're a power user running multiple strategies across multiple brokers or want to algorithmically tune parameters, Pro is the tier.",
    },
    {
      id: "self-host",
      q: "Can I self-host commercially?",
      a: "Personal use, internal company use, dev/research/educational use — all free under the Functional Source License. Hosting Beacontry as a competing commercial service (offering it to others as a paid trading platform) requires a commercial license from us. Email hello@beacontry.com if that's your use case. Each release auto-converts to Apache 2.0 after 2 years.",
    },
    {
      id: "team",
      q: "Can I get a team / family-office / firm license?",
      a: "Yes. Team and Enterprise tiers start at $299/seat/mo with role-based access control, dedicated tenant, SLA, white-label options, and custom data sources. Email hello@beacontry.com with your use case.",
    },
    {
      id: "data",
      q: "Where does the data come from?",
      a: "Yahoo Finance (price data), Finnhub (news + analyst ratings + insider transactions), Reddit (ticker mentions, public RSS), House Clerk PTR archive (Congressional trades), Groq (Llama 3.3 for AI features). All upstream — we don't aggregate or resell.",
    },
    {
      id: "tax",
      q: "Does Beacontry handle taxes?",
      a: "Beacontry generates Form 8949 + tracks FIFO realized gains + wash-sale flags (or honors §475(f) MTM election if you've filed one). It is NOT a tax filing service or a registered tax professional. Verify with your CPA before filing.",
    },
  ];

  return (
    <div className="min-h-screen bg-ld-deep font-[family-name:var(--font-display)] text-ld-text">
      {/* ── Navbar — same structure as landing ── */}
      <nav className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-200 ${scrolled ? "border-ld-accent/18 bg-ld-deep/94 shadow-[0_10px_30px_rgba(0,0,0,0.24)]" : "border-ld-border bg-ld-deep/86"} backdrop-blur-[18px]`}>
        <div className="mx-auto flex min-h-[78px] max-w-[1280px] items-center justify-between gap-4 px-5 lg:px-7">
          <Link href="/" className="flex items-center gap-3 text-[1.25rem] font-bold tracking-tight">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ld-accent text-white">
              <BeacontryMark variant="full" className="h-8 w-8" aria-label="Beacontry" />
            </div>
            Beacontry
          </Link>

          <ul className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={`text-[0.94rem] font-medium transition-colors duration-200 hover:text-ld-text ${
                    link.href === "/pricing" ? "text-ld-text" : "text-ld-text-secondary"
                  }`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-3 md:flex">
            <ThemePicker variant="icon" />
            <Link href="/register" className="rounded-[10px] bg-ld-accent px-5 py-3 text-[0.92rem] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-ld-accent-dim hover:shadow-[0_10px_34px_rgba(16,185,129,0.16)]">
              Get Started
            </Link>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemePicker variant="icon" />
            <button onClick={() => setMenuOpen(!menuOpen)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-ld-border text-ld-text" aria-label="Menu">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-ld-border bg-ld-deep/96 px-5 pb-5 pt-3 backdrop-blur-[18px] md:hidden">
            <ul className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-3 text-[0.94rem] font-medium text-ld-text-secondary transition-colors hover:bg-ld-accent/8 hover:text-ld-text">{link.label}</a>
                </li>
              ))}
            </ul>
            <Link href="/register" onClick={() => setMenuOpen(false)} className="mt-3 block rounded-[10px] bg-ld-accent py-3 text-center text-[0.92rem] font-semibold text-white">
              Get Started
            </Link>
          </div>
        )}
      </nav>

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
        <div className="mx-auto grid max-w-[1180px] items-stretch gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3 lg:px-7">
          {tiers.map((tier, i) => (
            <article
              key={tier.name}
              className={`animate-fade-in-up stagger-${i + 1} relative flex flex-col rounded-2xl border bg-ld-card p-8 transition-all duration-250 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(0,0,0,0.32)] ${
                tier.highlight
                  ? "border-ld-accent/40 ring-1 ring-ld-accent/20"
                  : "border-ld-border hover:border-ld-border-accent"
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ld-accent px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                  {tier.tag}
                </div>
              )}
              {!tier.highlight && (
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ld-text-muted">{tier.tag}</p>
              )}

              <h3 className="mt-3 text-xl font-bold">{tier.name}</h3>
              <p className="mt-2 text-[0.9rem] text-ld-text-secondary">{tier.desc}</p>

              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-[2.5rem] font-extrabold leading-none">{tier.price}</span>
                {tier.cadence && <span className="text-ld-text-muted">{tier.cadence}</span>}
              </div>
              <p className="mt-1 text-[0.8rem] text-ld-text-muted">{tier.annual}</p>

              <ul className="mt-6 flex-1 space-y-2.5 text-[0.92rem]">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-ld-text-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ld-accent" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={tier.ctaHref}
                className={`mt-8 inline-flex items-center justify-center gap-2 rounded-[10px] px-5 py-3 text-[0.92rem] font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
                  tier.highlight
                    ? "bg-ld-accent text-white hover:bg-ld-accent-dim hover:shadow-[0_10px_34px_rgba(16,185,129,0.16)]"
                    : "border border-ld-border text-ld-text hover:border-ld-accent hover:bg-ld-accent/[0.06]"
                }`}
              >
                {tier.cta} {tier.name !== "Self-hosted" && <ArrowRight className="h-4 w-4" />}
              </Link>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-[680px] px-4 text-center text-[0.85rem] text-ld-text-muted">
          Need team / firm / white-label? <a href="mailto:hello@beacontry.com" className="text-ld-accent hover:underline">Email us</a> for Team and Enterprise pricing.
        </p>
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
          <div className="overflow-hidden rounded-2xl border border-ld-border bg-ld-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                {/* Sticky header */}
                <thead>
                  <tr className="border-b border-ld-border bg-ld-panel/60">
                    <th className="w-[40%] px-5 py-4 text-[0.78rem] font-mono uppercase tracking-[0.1em] text-ld-text-muted">
                      Feature
                    </th>
                    <th className="px-3 py-4 text-center text-[0.78rem] font-mono uppercase tracking-[0.1em] text-ld-text-secondary">
                      Trader
                    </th>
                    <th className="px-3 py-4 text-center text-[0.78rem] font-mono uppercase tracking-[0.1em] text-ld-accent">
                      Pro
                    </th>
                    <th className="px-3 py-4 text-center text-[0.78rem] font-mono uppercase tracking-[0.1em] text-ld-text-secondary">
                      Self-hosted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((category) => (
                    <Fragment key={category.name}>
                      {/* Category divider */}
                      <tr className="border-b border-ld-border/60 bg-ld-deep/30">
                        <td colSpan={4} className="px-5 py-2.5 text-[0.78rem] font-mono uppercase tracking-[0.1em] text-ld-accent">
                          {category.name}
                        </td>
                      </tr>
                      {category.rows.map((row, ri) => (
                        <tr
                          key={`${category.name}-${ri}`}
                          className="border-b border-ld-border/30 last:border-b-0 hover:bg-ld-panel/40"
                        >
                          <td className="px-5 py-3 text-[0.9rem] text-ld-text-secondary">
                            {row.label}
                          </td>
                          <td className="px-3 py-3 text-center">{renderCell(row.trader)}</td>
                          <td className="px-3 py-3 text-center">{renderCell(row.pro)}</td>
                          <td className="px-3 py-3 text-center">{renderCell(row.selfHosted)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-center text-[0.78rem] text-ld-text-muted">
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
                  <span className="text-[0.98rem] font-semibold text-ld-text">{faq.q}</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ld-border text-ld-text-secondary transition-transform duration-200 ${open ? "rotate-45 border-ld-accent text-ld-accent" : ""}`}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </button>
                {open && (
                  <div className="border-t border-ld-border/40 px-6 pb-5 pt-4 text-[0.94rem] leading-relaxed text-ld-text-secondary">
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
            Beacontry is currently invite-only beta. Join the waitlist and
            we&apos;ll let you know when public signup opens.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/#cta-waitlist" className="inline-flex items-center gap-2 rounded-[10px] bg-ld-accent px-8 py-4 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-ld-accent-dim hover:shadow-[0_10px_34px_rgba(16,185,129,0.16)]">
              Join Waitlist <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/" className="rounded-[10px] border border-ld-border px-8 py-4 text-base font-semibold text-ld-text transition-all duration-200 hover:-translate-y-0.5 hover:border-ld-accent hover:bg-ld-accent/[0.06]">
              Back to home
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-ld-border bg-ld-deep">
        <div className="mx-auto flex max-w-[1280px] items-center justify-center px-4 py-6 lg:px-7">
          <div className="text-[0.88rem] text-ld-text-muted">
            &copy; 2026 Beacontry. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
