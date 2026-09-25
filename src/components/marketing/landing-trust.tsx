import Link from "next/link";
import { ArrowRight, ArrowUpRight, Cpu, GitBranch, Lock, Server, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { SITE_NAV_OFFSET } from "@/components/marketing/site-nav";
import { BAND, SectionHeading } from "@/components/marketing/section-heading";

const TRUST: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: GitBranch,
    title: "Public source code",
    desc: "The signal pipeline, optimizer and audit log are source-available on GitHub under FSL-1.1, which converts to Apache 2.0 after two years. Read what your engine actually does, line by line.",
  },
  {
    icon: Lock,
    title: "Hash-chained audit log",
    desc: "Every order, halt, risk-profile change and admin action writes a tamper-evident row whose hash links to the previous one. Verify the chain at any time.",
  },
  {
    icon: Server,
    title: "Bring your own broker",
    desc: "Alpaca, Tradier or IBKR. You supply your own keys, encrypted at rest with AES-256-GCM. We never custody assets or see your account beyond your credentials.",
  },
  {
    icon: Cpu,
    title: "Inspectable signal DNA",
    desc: "Every signal shows its math: which indicators fired, which hybrid layers contributed, and the exact confidence calculation. Every decision is auditable.",
  },
];

// Surfaces that need no account, so a visitor can look around before
// signing up. `#explore` is the nav's anchor target.
const EXPLORE: { label: string; href: string; blurb: string; external?: boolean }[] = [
  { label: "Education hub", href: "/learn", blurb: "14 long-form guides on tax, FIRE, options and retirement" },
  { label: "Free calculators", href: "/tools", blurb: "8 calculators: FIRE, Roth, tax-loss harvesting and more" },
  { label: "Glossary", href: "/glossary", blurb: "95 trading and investing terms" },
  { label: "How the engine works", href: "/docs/engine-ruleset.html", blurb: "The full ruleset for the 8 trading modes" },
  { label: "Tier details", href: "/docs/tiers.html", blurb: "Feature matrix and pricing FAQ" },
  { label: "Source code", href: "https://github.com/beacontry/Sentinel", blurb: "FSL-1.1, Apache 2.0 after two years", external: true },
];

export function LandingTrust() {
  return (
    <section id="trust" aria-labelledby="trust-title" className={SITE_NAV_OFFSET}>
      <div className={BAND}>
        <SectionHeading
          id="trust-title"
          title="Trust is a property of how Beacontry is built"
          lede="Most AI signal tools are black boxes. This is how Beacontry is not."
        />
        <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {TRUST.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.title} className="border-t border-border pt-6">
                <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.02em] text-text-primary">
                  <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  {t.title}
                </h3>
                <p className="mt-3 max-w-[36rem] text-base text-text-secondary">{t.desc}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const ROW =
  "group flex min-h-11 items-start justify-between gap-4 py-4 transition-colors hover:text-text-primary";

/**
 * The closing band: the sign-up ask on the left, the no-account ways in on
 * the right, as one list of links rather than a card of six cards.
 */
export function LandingClosing() {
  return (
    <section aria-labelledby="closing-title" className="border-t border-border bg-bg-secondary">
      <div className={`${BAND} grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16`}>
        <div>
          <h2 id="closing-title" className="text-xl font-bold tracking-[-0.02em] text-balance text-text-primary lg:text-2xl lg:tracking-[-0.03em]">
            Your trading desk, automated
          </h2>
          <p className="mt-3 max-w-[32rem] text-base text-text-secondary">
            Connect your broker, choose a mode, and let Beacontry handle the rest. Every trade
            logged, every stop synced, full control when you want it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/register" className="px-6">
              Start trading <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" className="px-6">
              Sign in
            </ButtonLink>
          </div>
        </div>

        <div id="explore" className="scroll-mt-24">
          <h3 className="text-base font-semibold text-text-primary">Or explore freely, no account needed</h3>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {EXPLORE.map((link) => {
              const inner = (
                <>
                  <span className="min-w-0">
                    <span className="block font-medium text-text-primary">{link.label}</span>
                    <span className="mt-0.5 block text-sm text-text-muted">{link.blurb}</span>
                  </span>
                  {link.external ? (
                    <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-text-muted group-hover:text-accent" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
                  )}
                </>
              );
              return (
                <li key={link.href}>
                  {link.external ? (
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className={ROW}>
                      {inner}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <Link href={link.href} className={ROW}>
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
