"use client";

import Link from "next/link";
import { ArrowRight, Search, Cpu, Zap, TrendingUp, Target, BarChart3, LineChart, Bell, Brain, Lock, GitBranch, Server } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { EquityMockup } from "@/components/marketing/equity-mockup";
import { LandingNav } from "@/components/marketing/landing-nav";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";

export default function LandingPage() {
  // Public-browse links shown on the landing's final CTA section.
  // Replaces the legacy "join the waitlist" card — public free signup
  // is open, so a waitlist asking "we'll let you know when public
  // signup opens" was contradictory. These point at surfaces that
  // genuinely don't require an account so curious visitors can poke
  // around before committing to a signup.
  const exploreLinks: {
    label: string;
    href: string;
    blurb: string;
    external?: boolean;
  }[] = [
    {
      label: "Education hub",
      href: "/learn",
      blurb: "14 long-form guides on tax, FIRE, options, retirement",
    },
    {
      label: "Free calculators",
      href: "/tools",
      blurb: "8 calculators — FIRE, Roth, tax-loss harvesting…",
    },
    {
      label: "Glossary",
      href: "/glossary",
      blurb: "95 trading + investing terms",
    },
    {
      label: "How the engine works",
      href: "/docs/engine-ruleset.html",
      blurb: "Full ruleset for the 8 trading modes",
    },
    {
      label: "Tier details",
      href: "/docs/tiers.html",
      blurb: "Feature matrix + pricing FAQ",
    },
    {
      label: "Source code",
      href: "https://github.com/beacontry/Sentinel",
      blurb: "FSL-1.1, auto-Apache 2.0 after 2 years",
      external: true,
    },
  ];

  const heroPoints = [
    "Automated or manual",
    "Self-optimizing strategies",
    "Hash-chained audit log",
    "Tax + journal built in",
  ];

  const heroChecklist = [
    { title: "Two ways to trade.", desc: "Let the automated engine scan + place orders on a schedule, or use the manual order ticket (market / limit / stop / bracket) for trade-by-trade discretion. Same broker, same audit trail, your call." },
    { title: "Screener-driven signals.", desc: "Continuous market scan surfaces volume spikes, RS leaders, breakouts. Signals flow into either the engine OR a one-click trade ticket — every layer is inspectable." },
    { title: "Adaptive risk protection.", desc: "Trailing stops adjust in real time as trades develop. Broker-side stops protect positions even if the engine goes offline. Manual orders get the same bracket-order support." },
    { title: "Every trade journaled.", desc: "Entry context, exit reason, P&L logged automatically — for engine fills AND manual fills. Tax Center merges everything for wash-sale + §475(f) MTM tracking." },
  ];

  const stats = [
    { value: "500+", label: "Symbols Monitored" },
    { value: "Real-Time", label: "Broker Execution" },
    { value: "9", label: "Platform Modules" },
    { value: "Automated", label: "Risk Management" },
  ];

  const features = [
    { icon: Search, title: "Smart Market Screener", desc: "Continuously scans for actionable setups — volume spikes, relative strength leaders, earnings momentum, and technical breakouts. Qualifying signals are pushed directly to the trading engine.", tags: ["Volume", "RS Leaders", "Breakouts", "Auto-Push"] },
    { icon: Cpu, title: "Self-Optimizing Engine", desc: "Strategy parameters are automatically tuned using evolutionary algorithms. The engine tests thousands of configurations, selects top performers, and deploys them to live trading.", tags: ["Auto-Tune", "Evolutionary", "Per-Symbol"] },
    { icon: Zap, title: "Automated Execution", desc: "Signals from the screener flow through confidence gating and risk checks, then execute through your connected broker. From scan to filled order with no manual intervention.", tags: ["Confidence Gate", "Risk Checks", "Broker Sync"] },
    { icon: TrendingUp, title: "Dynamic Risk Management", desc: "Trailing stops adapt in real time — wide early to avoid noise, tightening as profit builds to lock in gains. All stops are synced to the broker for crash protection.", tags: ["Adaptive Stops", "Gain Lock-In", "Crash Protection"] },
    { icon: Target, title: "Multiple Trading Modes", desc: "Choose from several engine modes with different timing, risk profiles, and market health filters. Run conservative in choppy markets, aggressive in trends — switch with one click.", tags: ["Conservative", "Aggressive", "Tactical"] },
    { icon: BarChart3, title: "Multi-Timeframe Signals", desc: "Analysis runs across multiple resolutions simultaneously. Signals must show confluence across timeframes before the engine acts, filtering out false entries.", tags: ["Dual Resolution", "Confluence", "False Entry Filter"] },
  ];

  const pipeline = [
    { num: "01", title: "Scan", desc: "The screener continuously monitors the market for qualifying technical and momentum setups across 500+ symbols." },
    { num: "02", title: "Signal", desc: "Multi-layer analysis generates a confidence-scored signal combining technical, volume, and sentiment indicators." },
    { num: "03", title: "Validate", desc: "Risk checks, position sizing, portfolio exposure limits, and market health filters are applied before any order." },
    { num: "04", title: "Execute", desc: "Qualifying signals are executed through your connected broker with appropriate order types and stop placement." },
  ];

  // (terminalLines + lineColor removed 2026-05-14 — terminal mock replaced by annotated equity-curve SVG)

  const platform = [
    { icon: LineChart, title: "Automated Trade Journal", desc: "Every trade logged with entry context, exit reason, and P&L. Performance analytics by symbol, strategy, and time period." },
    { icon: Bell, title: "Real-Time Alerts", desc: "Custom rules for price, volume, and technical indicators. Stream to your dashboard and forward to Discord via webhooks." },
    { icon: Brain, title: "AI-Powered Analysis", desc: "Ask about any symbol — get technical positioning, fundamental context, and sentiment synthesized into one actionable response." },
  ];


  // schema.org SoftwareApplication markup — surfaced in Google rich
  // results and used by AI crawlers (Perplexity, Claude.ai, Bing chat)
  // to ground answers about Beacontry. JSON-LD; not executable JS, so
  // safe under the current CSP.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Beacontry",
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Trading intelligence platform",
    operatingSystem: "Web (Chromium, Firefox, Safari) / Self-hosted Docker",
    description:
      "Open-source trading intelligence platform with hybrid signal engine, manual order ticket, tax tooling (wash-sale + §475(f) MTM), and journaled trades on your own Alpaca / IBKR / Tradier brokerage account. Hash-chained audit log. Self-hostable under FSL-1.1-ALv2.",
    url: "https://beacontry.com",
    image: "https://beacontry.com/og-card.png",
    softwareVersion: "v3.1",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        description:
          "Research, education, screener, glossary, calculators, public Congress trades.",
      },
      {
        "@type": "Offer",
        name: "Trader",
        price: "20",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "20",
          priceCurrency: "USD",
          billingDuration: "P1M",
          billingIncrement: 1,
        },
        description:
          "Engine, manual order ticket, broker integration, journal, alerts, tax center.",
      },
      {
        "@type": "Offer",
        name: "Premium",
        price: "40",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "40",
          priceCurrency: "USD",
          billingDuration: "P1M",
          billingIncrement: 1,
        },
        description:
          "Everything in Trader + AI commentary + hybrid sentiment + GA optimizer.",
      },
    ],
    author: {
      "@type": "Organization",
      name: "Guard Cyber Solutions LLC",
      url: "https://beacontry.com",
    },
    license: "https://github.com/beacontry/Sentinel/blob/main/LICENSE",
    codeRepository: "https://github.com/beacontry/Sentinel",
    featureList: [
      "Hybrid signal pipeline (technical + sentiment + options flow + analyst + AI scoring + Reddit chatter)",
      "Manual order ticket (market / limit / stop / bracket, share-count or dollar-based)",
      "Automated trading engine with 7 modes (4 base + 2 tactical + 1 adaptive)",
      "Hash-chained audit log",
      "Wash-sale tracking + §475(f) MTM elections",
      "Trade journal with auto-stubs + AI weekly review",
      "Genetic-algorithm strategy optimizer",
      "Multi-broker support (Alpaca, IBKR, Tradier)",
      "14 long-form education guides + 8 calculators + 95 glossary terms",
    ],
  };

  return (
    <div className="min-h-screen bg-ld-deep font-[family-name:var(--font-display)] text-ld-text">
      {/* schema.org SoftwareApplication structured data for SEO + AI crawlers */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingNav />

      {/* ── Hero — exact Dark Moon structure ── */}
      <section className="relative flex min-h-screen items-center overflow-hidden pt-36 pb-20 lg:pt-36">
        <div className="landing-grid-bg pointer-events-none absolute inset-0" />

        <div className="relative z-10 mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-12 px-[var(--gutter)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div className="animate-fade-in-up text-center lg:text-left">
            <div className="mx-auto mb-5 inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-ld-border bg-ld-card px-4 py-1.5 lg:mx-0">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-ld-accent motion-safe:animate-pulse-dot" />
              <span className="eyebrow text-balance text-ld-accent">Trading intelligence · Automated or manual</span>
            </div>

            <h1 className="mx-auto max-w-[52rem] text-display font-extrabold tracking-[-0.04em] text-balance lg:mx-0">
              Scan. Signal. Execute.{" "}
              <span className="text-ld-accent">Automatically.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-[720px] text-base leading-relaxed text-ld-text-secondary lg:mx-0 lg:text-lg">
              Beacontry monitors the market, generates confidence-scored trading signals,
              and routes them either through the automated engine or to a manual order
              ticket — your choice, your broker, every decision inspectable.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4 lg:justify-start">
              <ButtonLink href="/register" className="px-6 text-base">
                Get Started Free
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" className="px-6 text-base">
                Sign In
              </ButtonLink>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              {heroPoints.map((point) => (
                <span key={point} className="inline-flex items-center gap-2 rounded-full border border-ld-border px-3 py-2 text-base text-ld-text-muted">
                  {point}
                </span>
              ))}
            </div>
          </div>

          {/* Hero Card — checklist */}
          <aside className="animate-fade-in-up stagger-1 top-accent-line min-w-0 rounded-xl border border-ld-border bg-ld-card p-6 shadow-pop sm:p-8">
            <h3 className="text-lg font-bold">What Beacontry does</h3>
            <p className="mt-3 text-base text-ld-text-secondary">
              A trading workspace — automated engine for hands-off operation, manual
              ticket for trade-by-trade discretion, both backed by audit-grade
              record-keeping and tax tooling.
            </p>

            {/* A plain divided list inside the one card: the items used to be
                bordered cards of their own with a hover shift, which read as
                clickable and nested cards in cards. */}
            <ul data-hero-checklist className="mt-3 divide-y divide-ld-border">
              {heroChecklist.map((item) => (
                <li key={item.title} className="flex gap-3 py-3.5 last:pb-0">
                  <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ld-green/10 text-xs font-bold text-ld-green">
                    ✓
                  </span>
                  <div className="text-base text-ld-text-secondary">
                    <strong className="text-ld-text">{item.title}</strong>
                    <br />
                    {item.desc}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-ld-border bg-ld-panel">
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 divide-x divide-ld-border px-[var(--gutter)] lg:grid-cols-4">
          {stats.map((stat, i) => (
            <div key={stat.label} className={`animate-fade-in-up stagger-${i + 1} min-w-0 px-3 py-9 text-center sm:px-5`}>
              <div className="font-mono text-xl font-bold text-ld-accent lg:text-2xl">{stat.value}</div>
              <div className="eyebrow mt-1 text-ld-text-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features — Dark Moon Services layout ── */}
      <section id="features" className="bg-ld-panel py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
          <p className="mb-3 eyebrow font-mono text-ld-accent">{"// core capabilities"}</p>
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.03em] text-balance">
            A trading engine built around real market conditions
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            Every module works together — the screener feeds the engine, the engine executes through
            your broker, and risk management adapts as positions develop.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1280px] gap-7 px-[var(--gutter)] sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <article key={f.title} className={`card-accent-line animate-fade-in-up stagger-${(i % 3) + 1} rounded-xl border border-ld-border bg-ld-card p-8`}>
                <div className="mb-4 grid h-[50px] w-[50px] place-items-center rounded-xl bg-ld-accent/[0.16] text-ld-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-ld-text-secondary">{f.desc}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {f.tags.map((tag) => (
                    <span key={tag} className="rounded-md border border-ld-border bg-ld-accent/7 px-2 py-1 font-mono text-xs text-ld-text-muted">{tag}</span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Process — Dark Moon's Process layout with terminal ── */}
      <section id="process" className="bg-ld-panel py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
          <p className="mb-3 eyebrow font-mono text-ld-accent">{"// how it works"}</p>
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.03em] text-balance">
            From market scan to protected position in seconds
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            The screener identifies setups, the engine validates and executes, and risk management
            adapts in real time. Every step is automated. Every trade is logged.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1280px] gap-12 px-[var(--gutter)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
          <div className="grid gap-8 sm:grid-cols-2">
            {pipeline.map((step, i) => (
              <article key={step.num} className={`animate-fade-in-up stagger-${i + 1} rounded-xl border border-ld-border bg-ld-card p-8`}>
                <div className="mb-4 grid h-[52px] w-[52px] place-items-center rounded-full border border-ld-border bg-white/[0.02] font-mono font-bold text-ld-accent">
                  {step.num}
                </div>
                <h3 className="mb-2 text-base font-bold">{step.title}</h3>
                <p className="text-base leading-relaxed text-ld-text-secondary">{step.desc}</p>
              </article>
            ))}
          </div>

          {/* Equity-curve illustration (sample data, labelled as such). */}
          <EquityMockup />
        </div>
      </section>

      {/* ── Platform extras ── */}
      <section id="platform" className="py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
          <p className="mb-3 eyebrow font-mono text-ld-accent">{"// full platform"}</p>
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.03em] text-balance">
            Beyond the engine
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            Journal, alerts, and AI research — everything a trading desk needs, connected through
            one unified workflow.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1280px] gap-7 px-[var(--gutter)] sm:grid-cols-3">
          {platform.map((p, i) => {
            const Icon = p.icon;
            return (
              <article key={p.title} className={`card-accent-line animate-fade-in-up stagger-${i + 1} rounded-xl border border-ld-border bg-ld-card p-8`}>
                <div className="mb-4 grid h-[50px] w-[50px] place-items-center rounded-xl bg-ld-accent/[0.16] text-ld-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">{p.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-ld-text-secondary">{p.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <PricingTeaser />

      {/* ── Trust / "Why Beacontry" ── */}
      <section id="trust" className="py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
          <p className="mb-3 eyebrow font-mono text-ld-accent">{"// what makes us different"}</p>
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.03em] text-balance">
            Trust isn&apos;t a feature.
            <br />
            It&apos;s a property of how Beacontry is built.
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            Other AI signal tools are black boxes. We&apos;re not. Here&apos;s how that shows up.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1180px] gap-6 px-[var(--gutter)] sm:grid-cols-2">
          {[
            {
              icon: GitBranch,
              title: "Public source code",
              desc: "The signal pipeline, optimizer, and audit log are source-available on GitHub under FSL-1.1 (auto-converts to Apache 2.0 after 2 years). Read what your engine actually does — line by line. No vendor lock-in, no algorithmic opacity.",
            },
            {
              icon: Lock,
              title: "Hash-chained audit log",
              desc: "Every order, halt, risk-profile change, and admin action writes a tamper-evident row whose hash links to the previous. Verify the chain at any time. Most retail tools log nothing.",
            },
            {
              icon: Server,
              title: "Bring your own broker",
              desc: "Multi-broker (Alpaca, Tradier, IBKR). You supply your own keys, encrypted at rest with AES-256-GCM. We never custody assets, never see your account beyond your credentials.",
            },
            {
              icon: Cpu,
              title: "Inspectable signal DNA",
              desc: "Every signal shows its math: which indicators fired, which hybrid layers contributed, the exact confidence calculation. No 'trust the AI' — every decision is auditable.",
            },
          ].map((trust, i) => {
            const Icon = trust.icon;
            return (
              <article
                key={trust.title}
                className={`animate-fade-in-up stagger-${i + 1} rounded-xl border border-ld-border bg-ld-card p-8`}
              >
                <div className="mb-4 grid h-[50px] w-[50px] place-items-center rounded-xl bg-ld-accent/[0.16] text-ld-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">{trust.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-ld-text-secondary">{trust.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Final CTA with waitlist ── */}
      <section className="bg-ld-panel py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto max-w-[660px] px-4 text-center">
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.03em] text-balance">
            Your trading desk. Fully automated.
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-lg leading-relaxed text-ld-text-secondary">
            Connect your broker, choose a mode, and let Beacontry handle the rest.
            Every trade logged. Every stop synced. Full control when you want it.
          </p>

          {/* Existing buttons — go register or log in */}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <ButtonLink href="/register" className="px-8 text-base">
              Start Trading <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" className="px-8 text-base">
              Sign In
            </ButtonLink>
          </div>

          {/* Explore-freely grid — replaces the legacy waitlist card.
              All six surfaces are public (no account required), so a
              curious visitor can poke around before committing to a
              signup. Education + tools + engine docs are the substance
              proofs; source code is the transparency signal.
              `id="explore"` is the anchor target for the nav link. */}
          <div id="explore" className="mx-auto mt-12 max-w-[760px] rounded-xl border border-ld-border bg-ld-card p-6 lg:p-7 scroll-mt-24">
            <p className="eyebrow font-mono text-ld-text-muted text-center">
              Or explore freely — no account needed
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {exploreLinks.map((link) => {
                const baseCls =
                  "group flex flex-col gap-1 rounded-xl border border-ld-border bg-ld-deep/40 p-4 text-left transition-colors duration-200 hover:border-ld-accent/50 hover:bg-ld-accent/[0.04]";
                const inner = (
                  <>
                    <span className="flex items-center justify-between gap-2 text-base font-semibold text-ld-text">
                      {link.label}
                      <ArrowRight className="h-3.5 w-3.5 text-ld-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ld-accent" />
                    </span>
                    <span className="text-sm leading-relaxed text-ld-text-secondary">
                      {link.blurb}
                    </span>
                  </>
                );
                return link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={baseCls}
                  >
                    {inner}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href} className={baseCls}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-ld-border bg-ld-deep">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-3 px-[var(--gutter)] py-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-ld-text-muted">
            <Link href="/pricing" className="hover:text-ld-text">Pricing</Link>
            <Link href="/learn" className="hover:text-ld-text">Learn</Link>
            <Link href="/tools" className="hover:text-ld-text">Tools</Link>
            <Link href="/glossary" className="hover:text-ld-text">Glossary</Link>
            <Link href="/contact" className="hover:text-ld-text">Contact</Link>
            <Link href="/terms" className="hover:text-ld-text">Terms</Link>
            <Link href="/privacy" className="hover:text-ld-text">Privacy</Link>
            <Link href="/risk" className="hover:text-ld-text">Risk Disclosure</Link>
            <a href="https://github.com/beacontry/Sentinel" target="_blank" rel="noopener noreferrer" className="hover:text-ld-text">Source</a>
          </div>
          <div className="text-sm text-ld-text-muted">
            &copy; 2026 Beacontry. All rights reserved.
          </div>
          <div className="text-xs text-ld-text-muted max-w-[640px]">
            Beacontry is a software tool for market research and trade journaling.
            It is not a registered broker-dealer, investment advisor, or tax
            professional. Nothing here is investment advice.
          </div>
        </div>
      </footer>
    </div>
  );
}
