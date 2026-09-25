import { Search, Cpu, Zap, TrendingUp, Target, BarChart3, LineChart, Bell, Brain, Receipt, type LucideIcon } from "lucide-react";
import { SITE_NAV_OFFSET } from "@/components/marketing/site-nav";
import { BAND, SectionHeading } from "@/components/marketing/section-heading";

const FEATURES: { icon: LucideIcon; title: string; desc: string; tags: string[] }[] = [
  { icon: Search, title: "Smart market screener", desc: "Continuously scans for actionable setups: volume spikes, relative strength leaders, earnings momentum and technical breakouts. Qualifying signals are pushed directly to the trading engine.", tags: ["Volume", "RS leaders", "Breakouts", "Auto-push"] },
  { icon: Cpu, title: "Self-optimizing engine", desc: "Strategy parameters are tuned by an evolutionary algorithm. The engine tests thousands of configurations, selects the top performers and deploys them to live trading.", tags: ["Auto-tune", "Evolutionary", "Per-symbol"] },
  { icon: Zap, title: "Automated execution", desc: "Signals from the screener pass confidence gating and risk checks, then execute through your connected broker. From scan to filled order with no manual step, or hand any signal to the manual ticket instead.", tags: ["Confidence gate", "Risk checks", "Broker sync"] },
  { icon: TrendingUp, title: "Dynamic risk management", desc: "Trailing stops adapt in real time: wide early to avoid noise, tightening as profit builds. Stops are synced to the broker, so positions stay protected even if the engine goes offline.", tags: ["Adaptive stops", "Gain lock-in", "Crash protection"] },
  { icon: Target, title: "Multiple trading modes", desc: "Engine modes with different timing, risk profiles and market health filters. Run conservative in choppy markets and aggressive in trends, and switch with one click.", tags: ["Conservative", "Aggressive", "Tactical"] },
  { icon: BarChart3, title: "Multi-timeframe signals", desc: "Analysis runs across several resolutions at once. A signal must show confluence across timeframes before the engine acts, which filters out false entries.", tags: ["Dual resolution", "Confluence", "False-entry filter"] },
];

const PIPELINE = [
  { num: "01", title: "Scan", desc: "The screener monitors 500+ symbols for qualifying technical and momentum setups." },
  { num: "02", title: "Signal", desc: "Multi-layer analysis produces a confidence-scored signal from technical, volume and sentiment indicators." },
  { num: "03", title: "Validate", desc: "Risk checks, position sizing, exposure limits and market health filters run before any order." },
  { num: "04", title: "Execute", desc: "The order goes to your broker with the right order type and a broker-side stop." },
];

const PLATFORM: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: LineChart, title: "Automated trade journal", desc: "Every trade logged with entry context, exit reason and P&L, for engine fills and manual fills alike. Analytics by symbol, strategy and period." },
  { icon: Receipt, title: "Tax center", desc: "Every fill in one place for wash-sale tracking and §475(f) mark-to-market elections." },
  { icon: Bell, title: "Real-time alerts", desc: "Rules on price, volume and technical indicators, streamed to your dashboard and forwarded to Discord by webhook." },
  { icon: Brain, title: "AI-powered analysis", desc: "Ask about any symbol and get technical positioning, fundamental context and sentiment in one answer." },
];

/** The meta line of a feature: fields as elements, CSS draws the dots. */
function Tags({ tags }: { tags: string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-y-1 font-mono text-xs text-text-muted" aria-label="Keywords">
      {tags.map((tag) => (
        <li key={tag} className="before:mx-2 before:content-['·'] first:before:hidden">
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function LandingFeatures() {
  return (
    <section id="features" aria-labelledby="features-title" className={SITE_NAV_OFFSET}>
      <div className={BAND}>
        <SectionHeading
          id="features-title"
          title="A trading engine built around real market conditions"
          lede="Every module works together: the screener feeds the engine, the engine executes through your broker, and risk management adapts as positions develop."
        />
        <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <li key={f.title} className="border-t border-border pt-6">
                <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.02em] text-text-primary">
                  <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  {f.title}
                </h3>
                <p className="mt-3 text-base text-text-secondary">{f.desc}</p>
                <Tags tags={f.tags} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function LandingProcess() {
  return (
    <section id="process" aria-labelledby="process-title" className={`border-y border-border bg-bg-secondary ${SITE_NAV_OFFSET}`}>
      <div className={BAND}>
        <SectionHeading
          id="process-title"
          title="From market scan to protected position in seconds"
          lede="The screener finds setups, the engine validates and executes, and risk management adapts in real time. Every step is logged."
        />
        {/* One strip of four steps, divided by hairlines: a sequence, not
            four floating cards. Stacks on phones, 2 by 2 on tablets. */}
        <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((step) => (
            <li key={step.num} className="bg-bg-primary p-6 lg:p-7">
              <span className="font-mono text-sm font-semibold text-accent" aria-hidden="true">
                {step.num}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-text-primary">{step.title}</h3>
              <p className="mt-2 text-sm text-text-secondary">{step.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function LandingPlatform() {
  return (
    <section id="platform" aria-labelledby="platform-title" className={SITE_NAV_OFFSET}>
      <div className={`${BAND} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            id="platform-title"
            title="Beyond the engine"
            lede="Journal, tax, alerts and AI research, connected through one workflow."
          />
        </div>
        <ul className="divide-y divide-border border-y border-border">
          {PLATFORM.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 py-6">
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-bg-surface text-accent">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">{p.title}</h3>
                  <p className="mt-1.5 text-base text-text-secondary">{p.desc}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
