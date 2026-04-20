import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";

const features = [
  {
    num: "01",
    title: "One Integrated Workflow",
    description: "Scan, analyze, trade, and journal in sequence. No tab-switching, no duplicated chrome.",
  },
  {
    num: "02",
    title: "Thesis Validation",
    description: "Build conviction by aligning fundamental and technical context before you act.",
  },
  {
    num: "03",
    title: "Execution-Aware",
    description: "Trade with context while performance, risk limits, and P&L are kept in view.",
  },
];

const capabilities = [
  { title: "Self-Optimizing", detail: "Genetic algorithm backtests across the S&P 500 to find the best strategy parameters automatically." },
  { title: "7 Trading Modes", detail: "Conservative to Tactical — each mode combines timing, risk rules, and market health filters." },
  { title: "Automated Execution", detail: "Connected to Alpaca. The engine scans, signals, and trades while managing stops and risk limits." },
  { title: "Profit Lock-In", detail: "Dynamic trailing stops tighten as gains grow — 30%+ profit locks in 27% minimum automatically." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-secondary">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <span className="text-lg font-semibold text-text-primary">Sentinel</span>
              <span className="ml-2 hidden text-[10px] uppercase tracking-widest text-text-muted sm:inline">
                Market Operating Desk
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden items-center gap-6 md:flex">
              <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Features</a>
              <a href="#about" className="text-sm text-text-secondary hover:text-text-primary transition-colors">About</a>
              <a href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors">Pricing</a>
            </nav>
            <Link href="/login" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              Sign In
            </Link>
            <Link
              href="/register"
              className="hidden rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors sm:inline-flex"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
          Trade from a desk,<br />not a template.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-text-secondary lg:text-lg">
          A unified trading stack that combines scanner, analysis, execution,
          journaling, and news flow.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
          >
            Watch Demo
          </button>
        </div>
      </section>

      {/* Three Pillars */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.num} className="rounded-xl border border-border bg-bg-secondary p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-accent/30 font-mono text-sm font-semibold text-accent">
                {f.num}
              </div>
              <h3 className="mt-4 text-base font-semibold text-text-primary">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Section */}
      <section id="features" className="border-t border-border bg-bg-secondary px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Everything You Need, in One Powerful Platform
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-text-secondary">
            Built for traders who want conviction, not clutter.
          </p>

          {/* Product Preview */}
          <div className="mt-12 overflow-hidden rounded-xl border border-border bg-bg-primary">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <div className="h-3 w-3 rounded-full bg-bearish/40" />
              <div className="h-3 w-3 rounded-full bg-warning/40" />
              <div className="h-3 w-3 rounded-full bg-bullish/40" />
              <span className="ml-auto text-xs text-text-muted">Sentinel Desktop</span>
            </div>
            <div className="grid gap-px bg-border md:grid-cols-3">
              <div className="bg-bg-primary p-5">
                <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">Watchlist</div>
                <div className="mt-3 space-y-2.5 font-mono text-sm">
                  {["AAPL  $198.42  +1.2%", "NVDA  $875.30  +2.9%", "MSFT  $421.15  -0.3%"].map((l) => (
                    <div key={l} className="flex justify-between text-text-primary">
                      <span>{l.split("  ")[0]}</span>
                      <span>{l.split("  ")[1]} <span className={l.includes("+") ? "text-bullish" : "text-bearish"}>{l.split("  ")[2]}</span></span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-bg-primary p-5 text-center">
                <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">Today&apos;s P&amp;L</div>
                <div className="mt-3 font-mono text-3xl font-semibold text-bullish">+$482</div>
                <div className="mt-1 text-xs text-text-muted">4 trades &middot; 67% win rate</div>
              </div>
              <div className="bg-bg-primary p-5">
                <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">Scan Queue</div>
                <div className="mt-3 space-y-2">
                  {["RS Leader Forming", "Opening Range Pressure", "Earnings Follow-Through"].map((s) => (
                    <div key={s} className="rounded-lg bg-bg-surface px-3 py-2 text-sm text-text-secondary">{s}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {capabilities.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-bg-primary p-5">
                <h3 className="text-sm font-semibold text-text-primary">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="about" className="px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Ready to trade from a real desk?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            Stop juggling tabs and templates. Get a workspace built for how traders actually work.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            Sign Up Free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" /> Sentinel
          </div>
          <span>Trading intelligence platform</span>
        </div>
      </footer>
    </div>
  );
}
