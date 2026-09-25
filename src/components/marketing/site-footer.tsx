import Link from "next/link";
import { BeacontryMark } from "@/components/brand/beacontry-mark";

const SOURCE_URL = "https://github.com/beacontry/Sentinel";

const GROUPS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "How the engine works", href: "/docs/engine-ruleset.html" },
      { label: "Source code", href: SOURCE_URL, external: true },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Guides", href: "/learn" },
      { label: "Calculators", href: "/tools" },
      { label: "Glossary", href: "/glossary" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Risk disclosure", href: "/risk" },
    ],
  },
];

const LINK = "inline-flex min-h-11 items-center text-sm text-text-secondary transition-colors hover:text-text-primary sm:min-h-9";

/**
 * The one footer for the public site (landing and PublicShell), which
 * had two copies with different link sets. The disclaimer sits next to
 * the brand, where it is read as the description of what Beacontry is.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg-primary">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-[var(--gutter)] py-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <div className="max-w-md">
          <Link href="/" className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-md px-1 font-bold text-text-primary">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-on-accent">
              <BeacontryMark variant="full" className="h-5 w-5" />
            </span>
            Beacontry
          </Link>
          <p className="mt-3 text-sm text-text-muted">
            Beacontry is a software tool for market research and trade journaling. It is not a
            registered broker-dealer, investment advisor, or tax professional. Nothing here is
            investment advice.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm font-semibold text-text-primary">{group.title}</h2>
              <ul className="mt-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className={LINK}>
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={LINK}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-[1280px] px-[var(--gutter)] py-5 text-xs text-text-muted">
          &copy; 2026 Beacontry. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
