import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-secondary">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-xl font-semibold text-text-primary">Sentinel</span>
          </div>
          <Link
            href="/login"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-24 pb-16 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
          Trade from a desk,<br />not a template.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-text-secondary">
          Scanner, analysis, execution, and portfolio management in one workspace.
          Powered by a self-optimizing genetic algorithm.
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
      </section>

      {/* Three features */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { title: "Self-Optimizing", description: "Genetic algorithm backtests across the S&P 500 to find the best strategy parameters automatically." },
            { title: "7 Trading Modes", description: "Conservative to Tactical — each mode combines timing, risk rules, and market health filters." },
            { title: "Automated Execution", description: "Connected to Alpaca. The engine scans, signals, and trades while managing stops and risk limits." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-bg-secondary p-6">
              <h3 className="text-base font-semibold text-text-primary">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />
            Sentinel
          </div>
          <span>Trading intelligence platform</span>
        </div>
      </footer>
    </div>
  );
}
