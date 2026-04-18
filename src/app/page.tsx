import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  FileText,
  LayoutGrid,
  ScanSearch,
  Shield,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";

const deskMetrics = [
  {
    value: "12",
    label: "Operational surfaces",
    note: "Scanner, trader, journal, calendar, forum, and policy live in one shell.",
  },
  {
    value: "1",
    label: "Working rhythm",
    note: "Scan, thesis, execute, and review happen in sequence instead of across tabs.",
  },
  {
    value: "0",
    label: "Template sections",
    note: "No filler KPI slab, testimonial carousel, or generic marketing card wall.",
  },
] as const;

const workflowSteps = [
  {
    label: "Scan",
    title: "Market pressure",
    detail: "Screener, relative strength, alerts, and news align before a name earns attention.",
  },
  {
    label: "Build",
    title: "Thesis formation",
    detail: "Charts, filings, fundamentals, and social context sit beside the same symbol state.",
  },
  {
    label: "Execute",
    title: "Trade workflow",
    detail: "Trader, portfolio, and strategy surfaces stay attached to the original setup.",
  },
  {
    label: "Review",
    title: "Decision memory",
    detail: "Journal entries and performance live near the evidence that created them.",
  },
] as const;

const pillarCards = [
  {
    icon: Sparkles,
    label: "Research",
    title: "Analysis cockpit",
    detail: "Charts, filings, fundamentals, insiders, and news stay in the same working field.",
  },
  {
    icon: Target,
    label: "Precision",
    title: "Execution-aware",
    detail: "Alerts, trader status, backtests, and portfolio context are part of the same desk.",
  },
  {
    icon: Workflow,
    label: "Flow",
    title: "One operating rhythm",
    detail: "Move from scan to thesis to trade review without dropping context or opening side tools.",
  },
] as const;

const deskModules = [
  { name: "Scanner", status: "Momentum + breakout" },
  { name: "Analysis", status: "AAPL, NVDA, MSFT" },
  { name: "Trader", status: "2 positions armed" },
  { name: "Journal", status: "3 notes pending" },
  { name: "News", status: "Macro tape active" },
  { name: "Forum", status: "2 threads worth reading" },
] as const;

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-4" style={{ paddingLeft: "clamp(1rem, 5vw, 6rem)", paddingRight: "clamp(1rem, 5vw, 6rem)" }}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 40px), repeating-linear-gradient(currentColor 0 1px, transparent 1px 40px)' }} />

      <div className="flex min-h-[calc(100vh-2rem)] w-full flex-col gap-5">
        <header className="flex items-center justify-between rounded-[16px] border border-border bg-bg-secondary px-4 py-3 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-accent/25 bg-accent/12 text-accent">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-[1.85rem] leading-none text-text-primary">
                Sentinel
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-text-muted">
                Market Operating Desk
              </div>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-[42px] items-center justify-center rounded-[12px] border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-bg-elevated hover:text-text-primary"
          >
            Sign In
          </Link>
        </header>

        <main className="flex flex-1 justify-center">
          <section className="surface-panel relative w-full overflow-hidden rounded-xl px-5 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="pointer-events-none absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 36px), repeating-linear-gradient(currentColor 0 1px, transparent 1px 36px)' }} />

            <div className="relative w-full">
              <div className="flex flex-col items-center text-center">
                <div className="inline-flex rounded-[10px] border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-accent">
                  Built for conviction, not dashboards
                </div>
                <h1 className="mt-5 max-w-4xl font-display text-5xl leading-[0.92] text-text-primary sm:text-6xl xl:text-[5.4rem]">
                  Trade from a desk,
                  <br />
                  not a template.
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-relaxed text-text-secondary lg:text-lg">
                  Sentinel combines scanning, analysis, live execution, journaling, and social
                  flow into one workspace that behaves like an operating desk instead of a generic
                  SaaS shell.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/register"
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-accent-hover"
                  >
                    Open Your Desk
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] border border-border px-6 text-sm font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-bg-elevated hover:text-text-primary"
                  >
                    Return to Workspace
                  </Link>
                </div>
              </div>

              <div className="mt-8 grid gap-3 md:grid-cols-3">
                {deskMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-[14px] border border-border bg-bg-secondary p-4 text-center"
                  >
                    <div className="font-mono text-3xl leading-none text-text-primary">
                      {metric.value}
                    </div>
                    <div className="mt-3 text-[10px] uppercase tracking-[0.08em] text-text-muted">
                      {metric.label}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {metric.note}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="surface-muted rounded-[18px] p-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-accent">
                        Desk Routing
                      </div>
                      <div className="mt-1 text-sm font-medium text-text-primary">
                        One idea, one working path
                      </div>
                    </div>
                    <LayoutGrid className="h-4 w-4 text-text-muted" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {workflowSteps.map((step, index) => (
                      <div
                        key={step.title}
                        className="rounded-[12px] border border-border bg-bg-elevated p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-border bg-bg-secondary font-mono text-[11px] text-text-muted">
                            0{index + 1}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.08em] text-accent">
                              {step.label}
                            </div>
                            <div className="mt-1 text-sm font-medium text-text-primary">
                              {step.title}
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative min-h-[29rem] overflow-hidden rounded-xl border border-border bg-bg-surface p-5">
                  <div className="pointer-events-none absolute inset-0 bg-accent/[0.03]" style={{ maskImage: 'linear-gradient(180deg, black 0%, transparent 28%)' }} />
                  <div className="relative flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-accent">
                        Live Desk Preview
                      </div>
                      <div className="mt-1 text-sm font-medium text-text-primary">
                        A homepage that actually previews the product shape
                      </div>
                    </div>
                    <Workflow className="h-4 w-4 text-text-muted" />
                  </div>

                  <div className="relative mt-4 rounded-[18px] border border-border bg-bg-elevated p-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted">
                          Market Focus
                        </div>
                        <div className="mt-1 text-lg font-semibold text-text-primary">
                          Conviction + Risk
                        </div>
                      </div>
                      <div className="rounded-[10px] border border-border bg-bg-secondary px-3 py-1 font-mono text-[11px] text-bullish">
                        LIVE
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[14px] border border-border bg-bg-secondary p-3">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted">
                          Watchlist
                        </div>
                        <div className="mt-3 space-y-2">
                          {["AAPL", "NVDA", "MSFT"].map((symbol) => (
                            <div
                              key={symbol}
                              className="flex items-center justify-between border-b border-border pb-2 last:border-b-0 last:pb-0"
                            >
                              <span className="font-mono text-[13px] text-text-primary">
                                {symbol}
                              </span>
                              <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
                                Tracking
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-border bg-bg-secondary p-3">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted">
                          Scan Queue
                        </div>
                        <div className="mt-3 space-y-2">
                          {[
                            "RS leader forming",
                            "Opening range pressure",
                            "Earnings follow-through",
                          ].map((item) => (
                            <div
                              key={item}
                              className="rounded-[10px] border border-border bg-bg-elevated px-2.5 py-2 text-sm text-text-secondary"
                            >
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-border bg-bg-secondary p-3">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted">
                          P&amp;L / Status
                        </div>
                        <div className="mt-3 flex items-end justify-between">
                          <div className="font-display text-4xl leading-none text-bullish">
                            +$482
                          </div>
                          <div className="text-right text-[11px] uppercase tracking-[0.14em] text-text-muted">
                            4 trades
                            <br />
                            67% win rate
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-border bg-bg-secondary p-3">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted">
                          Review Loop
                        </div>
                        <div className="mt-3 space-y-2">
                          {["Journal note pending", "Backtest refreshed", "Forum recap saved"].map(
                            (item) => (
                              <div
                                key={item}
                                className="flex items-center justify-between border-b border-border pb-2 last:border-b-0 last:pb-0"
                              >
                                <span className="text-sm text-text-secondary">{item}</span>
                                <span className="h-2 w-2 rounded-full bg-accent" />
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2">
                      {[
                        "Screener and trader share the same symbol state.",
                        "News, filings, and notes stay close to the setup.",
                        "The desk keeps operational memory visible.",
                      ].map((line) => (
                        <div
                          key={line}
                          className="flex items-center justify-between rounded-[10px] border border-border bg-bg-secondary px-3 py-2"
                        >
                          <span className="text-sm text-text-secondary">{line}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_18rem]">
                <div className="rounded-[18px] border border-border bg-bg-elevated p-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-accent">
                        Operational Spread
                      </div>
                      <div className="mt-1 text-sm font-medium text-text-primary">
                        The workspace is shaped around active work, not promo blocks.
                      </div>
                    </div>
                    <Activity className="h-4 w-4 text-text-muted" />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[12px] border border-border bg-bg-secondary p-3">
                      <div className="flex items-center gap-2">
                        <ScanSearch className="h-4 w-4 text-accent" />
                        <div className="text-sm font-medium text-text-primary">Research stack</div>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                        Screener, analysis, filings, correlation, and relative strength work as one
                        bench instead of separate pages with duplicated chrome.
                      </p>
                    </div>
                    <div className="rounded-[12px] border border-border bg-bg-secondary p-3">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-accent" />
                        <div className="text-sm font-medium text-text-primary">Execution stack</div>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                        Trader, strategies, paper flow, backtests, and portfolio surfaces stay close
                        to the same symbol state and position context.
                      </p>
                    </div>
                    <div className="rounded-[12px] border border-border bg-bg-secondary p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-accent" />
                        <div className="text-sm font-medium text-text-primary">Review stack</div>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                        Journal, performance, alerts, and P&amp;L history stay inside the same memory
                        loop instead of becoming orphaned screens.
                      </p>
                    </div>
                    <div className="rounded-[12px] border border-border bg-bg-secondary p-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-accent" />
                        <div className="text-sm font-medium text-text-primary">Conversation stack</div>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                        Feed, forum, posts, and community context support the workflow instead of
                        pulling attention into a separate social surface.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[18px] border border-border bg-bg-elevated p-4">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-accent">
                    Current Desk Mix
                  </div>
                  <div className="mt-4 space-y-2">
                    {deskModules.map((module) => (
                      <div
                        key={module.name}
                        className="flex items-center justify-between rounded-[12px] border border-border bg-bg-secondary px-3 py-2"
                      >
                        <span className="font-mono text-[13px] text-text-primary">{module.name}</span>
                        <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
                          {module.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {pillarCards.map((card) => {
                  const Icon = card.icon;

                  return (
                    <div
                      key={card.title}
                      className="rounded-[14px] border border-border bg-bg-secondary p-4 text-center"
                    >
                      <div className="flex justify-center">
                        <Icon className="h-4 w-4 text-accent" />
                      </div>
                      <div className="mt-3 text-[10px] uppercase tracking-[0.08em] text-text-muted">
                        {card.label}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-text-primary">
                        {card.title}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                        {card.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
