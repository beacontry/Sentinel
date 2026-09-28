"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemePicker } from "@/components/theme-picker";
import { BeacontryMark } from "@/components/brand/beacontry-mark";
import { PWAInstallButton } from "@/components/pwa-install-button";
import { ButtonLink } from "@/components/ui/button-link";

export interface SiteNavLink {
  label: string;
  href: string;
}

/** In-page anchors on the landing page. */
export const LANDING_NAV_LINKS: SiteNavLink[] = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#process" },
  // /pricing is the canonical pricing surface (full matrix and FAQ); the
  // #pricing teaser on the landing is the quick glance.
  { label: "Pricing", href: "/pricing" },
  { label: "Why Beacontry", href: "#trust" },
  { label: "Explore freely", href: "#explore" },
];

/** The landing anchors, reachable from another page. */
export const LANDING_NAV_LINKS_ABSOLUTE: SiteNavLink[] = LANDING_NAV_LINKS.map((l) =>
  l.href.startsWith("#") ? { ...l, href: `/${l.href}` } : l,
);

/** The public content pages (learn, tools, glossary...). */
export const PUBLIC_NAV_LINKS: SiteNavLink[] = [
  { label: "Learn", href: "/learn" },
  { label: "Tools", href: "/tools" },
  { label: "Glossary", href: "/glossary" },
  { label: "Congress", href: "/congress" },
  { label: "Articles", href: "/articles" },
  { label: "Pricing", href: "/pricing" },
];

/** The fixed nav is h-16 under the safe-area inset; anchors clear it. */
export const SITE_NAV_OFFSET = "scroll-mt-20";

const LINK =
  "flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors " +
  "hover:bg-bg-hover hover:text-text-primary aria-[current=page]:text-text-primary aria-[current=page]:bg-bg-hover";

/**
 * The one navbar for the public site: the landing page, /pricing and
 * every page in PublicShell. It was three hand-kept copies (two with a
 * translucent blurred bar, one with a hover-lifting CTA of its own).
 *
 * A solid bar on the page background, so nothing is glass; scrolling adds
 * only the pop shadow, which says the page has moved under it.
 */
export function SiteNav({ links, active }: { links: SiteNavLink[]; active?: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (link: SiteNavLink) =>
    !!active && (active === link.href.replace(/^\//, "") || active === link.label.toLowerCase());

  const renderLink = (link: SiteNavLink, className: string, onClick?: () => void) => {
    const current = isActive(link) ? "page" : undefined;
    // In-page anchors stay plain <a>: next/link adds nothing to a hash.
    return link.href.startsWith("#") ? (
      <a href={link.href} onClick={onClick} className={className}>
        {link.label}
      </a>
    ) : (
      <Link href={link.href} onClick={onClick} aria-current={current} className={className}>
        {link.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Site"
      className={`fixed inset-x-0 top-0 z-50 border-b border-border bg-bg-primary pt-[env(safe-area-inset-top)] transition-shadow duration-200 ${scrolled ? "shadow-pop" : ""}`}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-[var(--gutter)]">
        <Link href="/" className="-ml-1 flex min-h-11 items-center gap-2.5 rounded-md px-1 text-lg font-bold tracking-[-0.02em] text-text-primary">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">
            <BeacontryMark variant="full" className="h-7 w-7" />
          </span>
          Beacontry
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <li key={link.href}>{renderLink(link, LINK)}</li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemePicker variant="icon" />
          {/* Renders nothing unless the browser fires beforeinstallprompt. */}
          <PWAInstallButton className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary" />
          <ButtonLink href="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink href="/register">Get started</ButtonLink>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemePicker variant="icon" />
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-control text-text-primary"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="site-menu" className="border-t border-border bg-bg-primary px-[var(--gutter)] pb-5 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>{renderLink(link, `${LINK} text-base`, () => setMenuOpen(false))}</li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ButtonLink href="/login" variant="secondary" onClick={() => setMenuOpen(false)}>
              Sign in
            </ButtonLink>
            <ButtonLink href="/register" onClick={() => setMenuOpen(false)}>
              Get started
            </ButtonLink>
          </div>
          {/* The path Chrome Android users actually use; the browser menu's
              "Install app" item does not always show. */}
          <PWAInstallButton className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border-control text-sm font-medium text-text-primary" />
        </div>
      )}
    </nav>
  );
}
