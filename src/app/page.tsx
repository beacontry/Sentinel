import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";

const features = [
  { num: "01", title: "One Integrated Workflow", description: "Scan, analyze, trade, and journal in sequence. No tab-switching, no duplicated chrome." },
  { num: "02", title: "Thesis Validation", description: "Build conviction by aligning fundamental and technical context before you act." },
  { num: "03", title: "Execution-Aware", description: "Trade with context while performance, risk limits, and P&L are kept in view." },
];

const capabilities = [
  { title: "Self-Optimizing", detail: "Genetic algorithm backtests across the S&P 500 to find the best strategy parameters automatically." },
  { title: "7 Trading Modes", detail: "Conservative to Tactical — each mode combines timing, risk rules, and market health filters." },
  { title: "Automated Execution", detail: "Connected to Alpaca. The engine scans, signals, and trades while managing stops and risk limits." },
  { title: "Profit Lock-In", detail: "Dynamic trailing stops tighten as gains grow — 30%+ profit locks in 27% minimum automatically." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-bg-primary">
      {/* Header */}
      <header className="w-full border-b border-border bg-bg-secondary">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold text-text-primary">Sentinel</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
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
      <section className="w-full px-4 pt-20 pb-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl lg:text-5xl">
            Trade from a desk,<br />not a template.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-text-secondary">
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
            <Link
              href="/login"
              className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Three Pillars */}
      <section className="w-full px-4 pb-20 sm:px-6">
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.num} className="rounded-xl border border-border bg-bg-secondary p-5 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-accent/30 font-mono text-sm font-semibold text-accent">
                {f.num}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-text-primary">{f.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Section */}
      <section id="features" className="w-full border-t border-border bg-bg-secondary px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
            Everything You Need, in One Powerful Platform
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-text-secondary">
            Built for traders who want conviction, not clutter.
          </p>

          {/* Product Preview */}
          <div className="mt-10 overflow-hidden rounded-xl border border-border bg-bg-primary">
            <div className="grid gap-px bg-border sm:grid-cols-3">
              <div className="bg-bg-primary p-4">
                <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">Watchlist</div>
                <div className="mt-3 space-y-2 font-mono text-xs">
                  {[
                    { sym: "AAPL", price: "$198.42", chg: "+1.2%", up: true },
                    { sym: "NVDA", price: "$875.30", chg: "+2.9%", up: true },
                    { sym: "MSFT", price: "$421.15", chg: "-0.3%", up: false },
                  ].map((s) => (
                    <div key={s.sym} className="flex justify-between text-text-primary">
                      <span>{s.sym}</span>
                      <span>{s.price} <span className={s.up ? "text-bullish" : "text-bearish"}>{s.chg}</span></span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-bg-primary p-4 text-center">
                <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">Today&apos;s P&amp;L</div>
                <div className="mt-3 font-mono text-2xl font-semibold text-bullish">+$482</div>
                <div className="mt-1 text-[10px] text-text-muted">4 trades &middot; 67% win rate</div>
              </div>
              <div className="bg-bg-primary p-4">
                <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">Scan Queue</div>
                <div className="mt-3 space-y-1.5">
                  {["RS Leader Forming", "Opening Range Pressure", "Earnings Follow-Through"].map((s) => (
                    <div key={s} className="rounded-lg bg-bg-surface px-2.5 py-1.5 text-xs text-text-secondary">{s}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Capabilities */}
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {capabilities.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-bg-primary p-4">
                <h3 className="text-sm font-semibold text-text-primary">{c.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="about" className="w-full px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
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
      <footer className="w-full border-t border-border px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl text-center text-xs text-text-muted">
          Sentinel — Trading intelligence platform
        </div>
      </footer>
    </div>
  );
}
