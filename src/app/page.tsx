"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Search, Cpu, Zap, TrendingUp, Target, BarChart3, LineChart, Bell, Brain, Check, Lock, GitBranch, Server } from "lucide-react";
import { ThemePicker } from "@/components/theme-picker";
import { BeacontryMark } from "@/components/brand/beacontry-mark";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#process" },
    // Standalone /pricing page is the canonical pricing surface (full
    // feature-comparison matrix + FAQ). The #pricing teaser further
    // down this landing stays as a quick glance for scroll readers.
    { label: "Pricing", href: "/pricing" },
    { label: "Why Beacontry", href: "#trust" },
  ];

  // Waitlist form state — sits in the final CTA section. Public unauth
  // endpoint at /api/waitlist; rate-limited per IP, honeypot-protected.
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  // Hidden honeypot field. Real users never see this; bots filling
  // every input get caught and silently ignored server-side.
  const [waitlistHoneypot, setWaitlistHoneypot] = useState("");

  async function submitWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!waitlistEmail.trim() || waitlistStatus === "submitting") return;
    setWaitlistStatus("submitting");
    setWaitlistError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: waitlistEmail.trim(),
          source: "landing-hero",
          website: waitlistHoneypot,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setWaitlistError(typeof data.error === "string" ? data.error : "Couldn't save. Try again.");
        setWaitlistStatus("error");
        return;
      }
      setWaitlistStatus("success");
      setWaitlistEmail("");
    } catch {
      setWaitlistError("Network error. Try again.");
      setWaitlistStatus("error");
    }
  }

  const heroPoints = [
    "Self-optimizing strategies",
    "Automated execution",
    "Adaptive risk management",
    "Full trade journal",
  ];

  const heroChecklist = [
    { title: "Screener-driven signals.", desc: "The engine doesn't guess. It acts on qualifying setups pushed from a continuous market scan — volume spikes, RS leaders, technical breakouts." },
    { title: "Fully automated execution.", desc: "Signals pass through confidence gating and risk checks, then execute through your connected broker. No manual order entry." },
    { title: "Adaptive risk protection.", desc: "Trailing stops adjust in real time as trades develop. Stops are synced to the broker so positions are protected even if the engine goes offline." },
    { title: "Every trade journaled.", desc: "Entry context, exit reason, P&L, and strategy parameters are logged automatically. Review performance by symbol, mode, or time period." },
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

  const terminalLines = [
    { type: "comment", text: "# Engine scan cycle — optimized mode" },
    { type: "cmd", text: "beacontry scan --mode optimized --symbols sp500" },
    { type: "info", text: "[*] 487 symbols scanned \u2022 3 qualifying signals \u2022 2 passed confidence gate" },
    { type: "warning", text: "[!] INTC: screener signal pushed \u2022 STRONG_BUY \u2022 volume +180% avg" },
    { type: "cmd", text: "beacontry execute --symbol INTC --validate risk" },
    { type: "success", text: "[+] Risk check passed \u2022 position sized \u2022 order filled \u2022 trailing stop placed" },
    { type: "cmd", text: "beacontry status --positions" },
    { type: "success", text: "[+] 15 positions tracked \u2022 all stops synced to broker \u2022 journal updated" },
  ];

  const platform = [
    { icon: LineChart, title: "Automated Trade Journal", desc: "Every trade logged with entry context, exit reason, and P&L. Performance analytics by symbol, strategy, and time period." },
    { icon: Bell, title: "Real-Time Alerts", desc: "Custom rules for price, volume, and technical indicators. Stream to your dashboard and forward to Discord via webhooks." },
    { icon: Brain, title: "AI-Powered Analysis", desc: "Ask about any symbol — get technical positioning, fundamental context, and sentiment synthesized into one actionable response." },
  ];

  const lineColor: Record<string, string> = {
    comment: "text-ld-text-muted italic",
    cmd: "text-ld-text",
    info: "text-ld-accent",
    warning: "text-ld-amber",
    success: "text-ld-cyan",
  };

  return (
    <div className="min-h-screen bg-ld-deep font-[family-name:var(--font-display)] text-ld-text">
      {/* ── Navbar — exact Dark Moon structure ── */}
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
                <a href={link.href} className="text-[0.94rem] font-medium text-ld-text-secondary transition-colors duration-200 hover:text-ld-text">{link.label}</a>
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

      {/* ── Hero — exact Dark Moon structure ── */}
      <section className="relative flex min-h-screen items-center overflow-hidden pt-36 pb-20 lg:pt-36">
        <div className="landing-grid-bg pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute bottom-[8%] left-1/2 h-[840px] w-[840px] -translate-x-1/2 rounded-full bg-ld-accent/[0.16] blur-[200px]" />

        <div className="relative z-10 mx-auto grid w-full max-w-[1280px] gap-12 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:px-7">
          <div className="animate-fade-in-up text-center lg:text-left">
            <div className="mx-auto mb-5 inline-flex items-center justify-center gap-2 rounded-full border border-ld-accent/22 bg-ld-accent/10 px-4 py-1.5 lg:mx-0">
              <span className="animate-pulse-dot h-2 w-2 rounded-full bg-ld-accent" />
              <span className="font-mono text-xs uppercase tracking-wider text-ld-accent">Automated Trading Intelligence</span>
            </div>

            <h1 className="mx-auto max-w-[52rem] text-[clamp(2.4rem,6vw,4.8rem)] font-extrabold leading-[1.04] tracking-tighter lg:mx-0">
              Scan. Signal. Execute.{" "}
              <span className="text-ld-accent">Automatically.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-[720px] text-[clamp(1rem,2vw,1.16rem)] leading-relaxed text-ld-text-secondary lg:mx-0">
              Beacontry monitors the market, generates confidence-scored trading signals,
              executes through your broker, and protects every position with adaptive
              risk management — fully automated.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4 lg:justify-start">
              <Link href="/register" className="rounded-[10px] bg-ld-accent px-6 py-3.5 font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-ld-accent-dim hover:shadow-[0_10px_34px_rgba(16,185,129,0.16)]">
                Get Started Free
              </Link>
              <Link href="/login" className="rounded-[10px] border border-ld-border bg-white/[0.01] px-6 py-3.5 font-semibold text-ld-text transition-all duration-200 hover:-translate-y-0.5 hover:border-ld-accent hover:bg-ld-accent/[0.06]">
                Sign In
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              {heroPoints.map((point) => (
                <span key={point} className="inline-flex items-center gap-2 rounded-full border border-ld-border bg-white/[0.01] px-3 py-2 text-[0.92rem] text-ld-text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-ld-accent/32 hover:bg-ld-accent/8">
                  {point}
                </span>
              ))}
            </div>
          </div>

          {/* Hero Card — checklist */}
          <aside className="animate-fade-in-up stagger-1 top-accent-line rounded-2xl border border-ld-border bg-ld-card p-8 shadow-[0_22px_60px_rgba(0,0,0,0.32)] transition-all duration-300 hover:-translate-y-1 hover:border-ld-accent/28 hover:shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
            <h3 className="text-lg font-bold">What Beacontry does</h3>
            <p className="mt-3 text-[0.95rem] text-ld-text-secondary">
              A fully automated trading desk — from market scanning to order execution to
              risk management — with every trade logged for review.
            </p>

            <ul className="mt-5 grid gap-3">
              {heroChecklist.map((item) => (
                <li key={item.title} className="flex gap-3 rounded-xl border border-ld-border bg-white/[0.01] p-3.5 transition-all duration-200 hover:translate-x-1 hover:border-ld-accent/24 hover:bg-ld-accent/5">
                  <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ld-green/10 text-xs font-bold text-ld-green">
                    ✓
                  </span>
                  <div className="text-[0.93rem] text-ld-text-secondary">
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
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 divide-x divide-ld-border px-4 lg:grid-cols-4 lg:px-0">
          {stats.map((stat, i) => (
            <div key={stat.label} className={`animate-fade-in-up stagger-${i + 1} px-5 py-9 text-center transition-colors hover:bg-white/[0.02]`}>
              <div className="font-mono text-[clamp(1.3rem,3vw,2.1rem)] font-bold text-ld-accent">{stat.value}</div>
              <div className="mt-1 text-[0.8rem] uppercase tracking-[0.12em] text-ld-text-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features — Dark Moon Services layout ── */}
      <section id="features" className="bg-ld-panel py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ld-accent">{"// core capabilities"}</p>
          <h2 className="text-[clamp(1.9rem,4vw,2.9rem)] font-bold leading-tight tracking-tight">
            A trading engine built around real market conditions
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            Every module works together — the screener feeds the engine, the engine executes through
            your broker, and risk management adapts as positions develop.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1280px] gap-7 px-4 sm:grid-cols-2 lg:grid-cols-3 lg:px-7">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <article key={f.title} className={`card-accent-line animate-fade-in-up stagger-${(i % 3) + 1} rounded-2xl border border-ld-border bg-ld-card p-8 transition-all duration-250 hover:-translate-y-1 hover:border-ld-border-accent hover:bg-ld-card-hover hover:shadow-[0_22px_60px_rgba(0,0,0,0.32)]`}>
                <div className="mb-4 grid h-[50px] w-[50px] place-items-center rounded-xl bg-ld-accent/[0.16] text-ld-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-3 text-[0.94rem] leading-relaxed text-ld-text-secondary">{f.desc}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {f.tags.map((tag) => (
                    <span key={tag} className="rounded-md border border-ld-border bg-ld-accent/7 px-2 py-1 font-mono text-[0.72rem] text-ld-text-muted">{tag}</span>
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
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ld-accent">{"// how it works"}</p>
          <h2 className="text-[clamp(1.9rem,4vw,2.9rem)] font-bold leading-tight tracking-tight">
            From market scan to protected position in seconds
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            The screener identifies setups, the engine validates and executes, and risk management
            adapts in real time. Every step is automated. Every trade is logged.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1280px] gap-12 px-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-start lg:px-7">
          <div className="grid gap-8 sm:grid-cols-2">
            {pipeline.map((step, i) => (
              <article key={step.num} className={`animate-fade-in-up stagger-${i + 1} rounded-2xl border border-ld-border bg-ld-card p-8 transition-all duration-250 hover:-translate-y-1 hover:border-ld-accent/22 hover:shadow-[0_22px_60px_rgba(0,0,0,0.32)]`}>
                <div className="mb-4 grid h-[52px] w-[52px] place-items-center rounded-full border border-ld-border bg-white/[0.02] font-mono font-bold text-ld-accent">
                  {step.num}
                </div>
                <h3 className="mb-2 text-[1.05rem] font-bold">{step.title}</h3>
                <p className="text-[0.98rem] leading-relaxed text-ld-text-secondary">{step.desc}</p>
              </article>
            ))}
          </div>

          {/* Terminal */}
          <div className="animate-fade-in-up stagger-1 overflow-hidden rounded-2xl border border-ld-border bg-[#0c0c14] shadow-[0_22px_60px_rgba(0,0,0,0.32)]">
            <div className="flex items-center gap-2 border-b border-ld-border bg-ld-card px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-2 font-mono text-xs text-ld-text-muted">beacontry@engine ~ optimized-mode</span>
            </div>
            <div className="p-7 font-mono text-[0.82rem] leading-[1.85]">
              {terminalLines.map((line, i) => (
                <div key={i} className={lineColor[line.type]}>
                  {line.type === "cmd" && <span className="text-ld-accent">$ </span>}
                  {line.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Platform extras ── */}
      <section id="platform" className="py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ld-accent">{"// full platform"}</p>
          <h2 className="text-[clamp(1.9rem,4vw,2.9rem)] font-bold leading-tight tracking-tight">
            Beyond the engine
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            Journal, alerts, and AI research — everything a trading desk needs, connected through
            one unified workflow.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1280px] gap-7 px-4 sm:grid-cols-3 lg:px-7">
          {platform.map((p, i) => {
            const Icon = p.icon;
            return (
              <article key={p.title} className={`card-accent-line animate-fade-in-up stagger-${i + 1} rounded-2xl border border-ld-border bg-ld-card p-8 transition-all duration-250 hover:-translate-y-1 hover:border-ld-border-accent hover:bg-ld-card-hover hover:shadow-[0_22px_60px_rgba(0,0,0,0.32)]`}>
                <div className="mb-4 grid h-[50px] w-[50px] place-items-center rounded-xl bg-ld-accent/[0.16] text-ld-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">{p.title}</h3>
                <p className="mt-3 text-[0.94rem] leading-relaxed text-ld-text-secondary">{p.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="bg-ld-panel py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ld-accent">{"// pricing"}</p>
          <h2 className="text-[clamp(1.9rem,4vw,2.9rem)] font-bold leading-tight tracking-tight">
            Simple pricing. Real power.
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            Bring your own broker. Annual saves ~17%. Cancel anytime.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1280px] items-stretch gap-5 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-7">
          {/* Four-tier structure (2026-05-14):
                Free        — research + education (no engine, no AI)
                Trader $20  — full platform without AI (most popular)
                Premium $45 — Trader + AI + future premium data
                Open Source — self-hosted, BYO infra */}
          {[
            {
              name: "Free",
              tag: "Hosted",
              price: "$0",
              cadence: "",
              annual: "Public data + education",
              desc: "Browse, learn, research. No trading.",
              features: [
                "All 14 guides + 95 glossary terms",
                "8 financial calculators",
                "Congressional trades + Reddit",
                "SEC filings + earnings calendar",
                "1 watchlist, 10 symbols",
                "Read-only community access",
                "No engine, no AI",
              ],
              cta: "Sign up free",
              highlight: false,
            },
            {
              name: "Trader",
              tag: "Most popular",
              price: "$20",
              cadence: "/ month",
              annual: "$200/yr — saves 2 months",
              desc: "Full platform without AI features.",
              features: [
                "Full engine (paper + live trading)",
                "All 8 modes + GA optimizer + adaptive",
                "Multi-broker (up to 3)",
                "Finnhub data (news, sentiment, options)",
                "Audit log + tax center + journal",
                "Unlimited watchlists + alerts",
                "Full community access",
              ],
              cta: "Start with Trader",
              highlight: true,
            },
            {
              name: "Premium",
              tag: "AI + future data",
              price: "$45",
              cadence: "/ month",
              annual: "$450/yr — saves 2 months",
              desc: "Trader + AI + premium data (coming).",
              features: [
                "Everything in Trader, plus:",
                "AI chat assistant (Groq Llama 3.3)",
                "AI signal scoring + journal review",
                "Daily AI market digest",
                "L2 / order book (roadmap)",
                "Real-time SIP feed (roadmap)",
                "Dark pool data (roadmap)",
              ],
              cta: "Step up to Premium",
              highlight: false,
            },
            {
              name: "Open Source",
              tag: "Self-host",
              price: "Free",
              cadence: "",
              annual: "Your data, your hardware",
              desc: "BYO Postgres + broker + API keys.",
              features: [
                "Full source code (FSL-1.1)",
                "Same engine, your control",
                "BYO Finnhub + Groq + broker",
                "No telemetry, no SaaS lock-in",
                "Privacy-first deployments",
                "No SLA, no hosted support",
              ],
              cta: "View on GitHub",
              highlight: false,
            },
          ].map((tier, i) => (
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
                href={tier.name === "Open Source" ? "https://github.com/beacontry/Sentinel" : "/register"}
                className={`mt-8 inline-flex items-center justify-center gap-2 rounded-[10px] px-5 py-3 text-[0.92rem] font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
                  tier.highlight
                    ? "bg-ld-accent text-white hover:bg-ld-accent-dim hover:shadow-[0_10px_34px_rgba(16,185,129,0.16)]"
                    : "border border-ld-border text-ld-text hover:border-ld-accent hover:bg-ld-accent/[0.06]"
                }`}
              >
                {tier.cta} {tier.name !== "Open Source" && <ArrowRight className="h-4 w-4" />}
              </Link>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-[680px] px-4 text-center text-[0.85rem] text-ld-text-muted">
          Need team / firm / white-label? <a href="mailto:hello@beacontry.com" className="text-ld-accent hover:underline">Get in touch</a> for Team and Enterprise pricing.
        </p>
      </section>

      {/* ── Trust / "Why Beacontry" ── */}
      <section id="trust" className="py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ld-accent">{"// what makes us different"}</p>
          <h2 className="text-[clamp(1.9rem,4vw,2.9rem)] font-bold leading-tight tracking-tight">
            Trust isn&apos;t a feature.
            <br />
            It&apos;s a property of how Beacontry is built.
          </h2>
          <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
            Other AI signal tools are black boxes. We&apos;re not. Here&apos;s how that shows up.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1180px] gap-6 px-4 sm:grid-cols-2 lg:px-7">
          {[
            {
              icon: GitBranch,
              title: "Open source engine",
              desc: "The signal pipeline, optimizer, and audit log are public code. Read what your engine actually does — line by line. No vendor lock-in, no algorithmic opacity.",
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
                className={`animate-fade-in-up stagger-${i + 1} rounded-2xl border border-ld-border bg-ld-card p-8 transition-all duration-250 hover:-translate-y-1 hover:border-ld-accent/22 hover:shadow-[0_22px_60px_rgba(0,0,0,0.32)]`}
              >
                <div className="mb-4 grid h-[50px] w-[50px] place-items-center rounded-xl bg-ld-accent/[0.16] text-ld-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">{trust.title}</h3>
                <p className="mt-3 text-[0.94rem] leading-relaxed text-ld-text-secondary">{trust.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Final CTA with waitlist ── */}
      <section className="bg-ld-panel py-28 lg:py-28">
        <div className="animate-fade-in-up mx-auto max-w-[660px] px-4 text-center">
          <h2 className="text-[clamp(1.9rem,4vw,2.9rem)] font-bold leading-tight tracking-tight">
            Your trading desk. Fully automated.
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-lg leading-relaxed text-ld-text-secondary">
            Connect your broker, choose a mode, and let Beacontry handle the rest.
            Every trade logged. Every stop synced. Full control when you want it.
          </p>

          {/* Existing buttons — go register or log in */}
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-[10px] bg-ld-accent px-8 py-4 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-ld-accent-dim hover:shadow-[0_10px_34px_rgba(16,185,129,0.16)]">
              Start Trading <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="rounded-[10px] border border-ld-border px-8 py-4 text-base font-semibold text-ld-text transition-all duration-200 hover:-translate-y-0.5 hover:border-ld-accent hover:bg-ld-accent/[0.06]">
              Sign In
            </Link>
          </div>

          {/* Waitlist — for visitors who aren't ready to sign up but want
              to be notified. Currently invite-only registration means
              walk-ups would bounce on the register page anyway. */}
          <div className="mx-auto mt-12 max-w-[480px] rounded-2xl border border-ld-border bg-ld-card p-6">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-ld-text-muted">
              Or join the waitlist
            </p>
            <p className="mt-2 text-[0.92rem] text-ld-text-secondary">
              Not ready yet? Drop your email and we&apos;ll let you know when public signup opens.
            </p>

            {waitlistStatus === "success" ? (
              <div className="mt-5 flex items-center justify-center gap-2 rounded-[10px] bg-ld-accent/10 border border-ld-accent/30 px-4 py-3 text-ld-accent">
                <Check className="h-4 w-4" />
                <span className="font-medium">You&apos;re on the list. We&apos;ll be in touch.</span>
              </div>
            ) : (
              <form onSubmit={submitWaitlist} className="mt-5 flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="flex-1 rounded-[10px] border border-ld-border bg-ld-deep px-4 py-3 text-[0.94rem] text-ld-text placeholder:text-ld-text-muted focus:border-ld-accent focus:outline-none focus:ring-1 focus:ring-ld-accent/40"
                  autoComplete="email"
                  aria-label="Email address"
                />
                {/* Honeypot — hidden from sighted users, ignored by screen readers.
                    Bots that auto-fill form fields trip this and get silently dropped server-side. */}
                <input
                  type="text"
                  name="website"
                  value={waitlistHoneypot}
                  onChange={(e) => setWaitlistHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: "absolute", left: "-10000px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }}
                />
                <button
                  type="submit"
                  disabled={waitlistStatus === "submitting" || !waitlistEmail.trim()}
                  className="rounded-[10px] bg-ld-accent px-5 py-3 text-[0.92rem] font-semibold text-white transition-all duration-200 hover:bg-ld-accent-dim disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {waitlistStatus === "submitting" ? "Joining…" : "Notify me"}
                </button>
              </form>
            )}

            {waitlistError && (
              <p className="mt-3 text-[0.85rem] text-red-400">{waitlistError}</p>
            )}
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
