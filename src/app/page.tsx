import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Eye,
  Layers,
  Play,
  RefreshCw,
  ScanSearch,
  Shield,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";

const pillars = [
  {
    number: "01",
    title: "One Integrated Workflow",
    description:
      "Scanner, analysis, trader, and journal live in one shell. No tab-switching, no duplicated chrome.",
    icon: Layers,
  },
  {
    number: "02",
    title: "Thesis Validation",
    description:
      "Charts, filings, fundamentals, and social context sit beside the same symbol state before you act.",
    icon: ScanSearch,
  },
  {
    number: "03",
    title: "Execution Aware",
    description:
      "Alerts, positions, backtests, and portfolio context are part of the same desk, not separate tools.",
    icon: Target,
  },
] as const;

const bottomCards = [
  {
    icon: Eye,
    title: "Analysis Cockpit",
    description:
      "Charts, filings, fundamentals, insiders, and news stay in the same working field. Research without context-switching.",
  },
  {
    icon: RefreshCw,
    title: "Execution Aware",
    description:
      "Trader status, backtests, and portfolio context are attached to the original setup. Act on conviction, not memory.",
  },
  {
    icon: Workflow,
    title: "One Operating Rhythm",
    description:
      "Scan to thesis to trade review without dropping context or opening side tools. The desk keeps operational memory visible.",
  },
] as const;

const featurePills = [
  "Screener & Thesis",
  "Execution Stack",
  "Trading Surfaces",
  "Journal & Review",
  "Social Feed",
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-bg-secondary/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <Shield className="h-4.5 w-4.5" />
            </div>
            <span className="font-display text-xl font-semibold text-text-primary">
              Sentinel
            </span>
          </div>

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Features
            </a>
            <a
              href="#about"
              className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              About
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Pricing
            </a>
          </nav>

          <Link
            href="/login"
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-bg-elevated hover:text-text-primary"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 pb-20 pt-20 lg:px-8 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center rounded-full border border-accent/20 bg-accent/8 px-4 py-1.5 text-xs font-medium tracking-wide text-accent">
            Built for conviction, not dashboards
          </div>

          <h1 className="mt-6 font-display text-4xl font-semibold leading-tight tracking-tight text-text-primary sm:text-5xl lg:text-6xl lg:leading-tight">
            Trade from a desk,
            <br />
            not a template.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-text-secondary lg:text-lg">
            Sentinel combines scanning, analysis, live execution, journaling,
            and social flow into one workspace that behaves like an operating
            desk.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/register"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-white transition-all hover:bg-accent-hover"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-border px-6 text-sm font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-bg-elevated hover:text-text-primary"
            >
              <Play className="h-4 w-4" />
              Watch Demo
            </button>
          </div>
        </div>
      </section>

      {/* Three Pillars */}
      <section className="px-4 pb-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.number}
                className="rounded-xl border border-border bg-bg-secondary p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-accent/30 font-mono text-sm font-semibold text-accent">
                    {pillar.number}
                  </div>
                  <Icon className="h-5 w-5 text-text-muted" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-text-primary">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section Divider */}
      <section id="features" className="px-4 pb-12 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Everything you need, in one powerful platform
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-text-secondary">
            A workspace shaped around active work, not promo blocks.
          </p>
        </div>
      </section>

      {/* Product Showcase */}
      <section className="px-4 pb-20 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-xl border border-border bg-bg-secondary">
            {/* Showcase top bar */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-bearish/40" />
                <div className="h-3 w-3 rounded-full bg-warning/40" />
                <div className="h-3 w-3 rounded-full bg-bullish/40" />
              </div>
              <span className="text-xs font-medium text-text-muted">
                Sentinel Desktop
              </span>
              <div className="w-14" />
            </div>

            {/* Showcase content */}
            <div className="grid gap-px bg-border md:grid-cols-3">
              {/* Watchlist */}
              <div className="bg-bg-secondary p-5">
                <div className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
                  Watchlist
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    { symbol: "AAPL", price: "$198.42", change: "+1.24%" },
                    { symbol: "NVDA", price: "$875.30", change: "+2.87%" },
                    { symbol: "MSFT", price: "$421.15", change: "-0.33%" },
                  ].map((stock) => (
                    <div
                      key={stock.symbol}
                      className="flex items-center justify-between"
                    >
                      <span className="font-mono text-sm font-medium text-text-primary">
                        {stock.symbol}
                      </span>
                      <div className="text-right">
                        <span className="font-mono text-sm text-text-primary">
                          {stock.price}
                        </span>
                        <span
                          className={`ml-2 font-mono text-xs ${
                            stock.change.startsWith("+")
                              ? "text-bullish"
                              : "text-bearish"
                          }`}
                        >
                          {stock.change}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* P&L Center */}
              <div className="bg-bg-secondary p-5 text-center">
                <div className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
                  Today&apos;s P&amp;L
                </div>
                <div className="mt-4 font-mono text-3xl font-semibold text-bullish">
                  +$482
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  4 trades &middot; 67% win rate
                </div>
              </div>

              {/* Scan Queue */}
              <div className="bg-bg-secondary p-5">
                <div className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
                  Scan Queue
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    "RS Leader Forming",
                    "Opening Range Pressure",
                    "Earnings Follow-Through",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 rounded-lg bg-bg-surface px-3 py-2 text-sm text-text-secondary"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
              {featurePills.map((pill) => (
                <span
                  key={pill}
                  className="rounded-full bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Three Bottom Cards */}
      <section id="about" className="px-4 pb-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          {bottomCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-xl border border-border bg-bg-secondary p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-text-primary">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {card.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-border bg-bg-secondary px-4 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Ready to trade from a real desk?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            Stop juggling tabs and templates. Get a workspace built for how
            traders actually work.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-accent px-8 text-sm font-semibold text-white transition-all hover:bg-accent-hover"
          >
            Sign Up Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Shield className="h-4 w-4" />
            <span>Sentinel</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-text-muted">
            <a href="#" className="transition-colors hover:text-text-secondary">
              Privacy
            </a>
            <a href="#" className="transition-colors hover:text-text-secondary">
              Terms
            </a>
            <a href="#" className="transition-colors hover:text-text-secondary">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
