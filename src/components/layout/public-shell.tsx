"use client";

// PublicShell — thin navbar + footer wrapping any public marketing /
// content page. Used by /learn, /tools, /glossary, /congress, /articles.
//
// Distinct from src/components/layout/app-shell.tsx (the auth-required
// dashboard sidebar) because public pages need:
//   - No sidebar (full-width content)
//   - SEO-friendly minimal chrome
//   - Cross-links to the broader public surface (Features, Pricing, etc.)
//   - Get Started CTA in the nav
//
// Borrows the landing page's `ld-*` design tokens for visual consistency.

import Link from "next/link";
import { useEffect, useState } from "react";
import { BeacontryMark } from "@/components/brand/beacontry-mark";
import { ThemePicker } from "@/components/theme-picker";

const PUBLIC_NAV_LINKS = [
  { label: "Learn", href: "/learn" },
  { label: "Tools", href: "/tools" },
  { label: "Glossary", href: "/glossary" },
  { label: "Congress", href: "/congress" },
  { label: "Articles", href: "/articles" },
  { label: "Pricing", href: "/pricing" },
];

interface PublicShellProps {
  children: React.ReactNode;
  /** Which nav link to highlight as active (e.g., 'learn', 'pricing'). */
  active?: string;
}

export function PublicShell({ children, active }: PublicShellProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-ld-deep font-[family-name:var(--font-display)] text-ld-text">
      {/* Navbar — mirrors src/app/page.tsx structure but with public-route nav links */}
      <nav className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-200 ${scrolled ? "border-ld-accent/18 bg-ld-deep/94 shadow-[0_10px_30px_rgba(0,0,0,0.24)]" : "border-ld-border bg-ld-deep/86"} backdrop-blur-[18px]`}>
        <div className="mx-auto flex min-h-[78px] max-w-[1280px] items-center justify-between gap-4 px-5 lg:px-7">
          <Link href="/" className="flex items-center gap-3 text-[1.25rem] font-bold tracking-tight">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ld-accent text-white">
              <BeacontryMark variant="full" className="h-8 w-8" aria-label="Beacontry" />
            </div>
            Beacontry
          </Link>

          <ul className="hidden items-center gap-5 md:flex">
            {PUBLIC_NAV_LINKS.map((link) => {
              const isActive =
                active === link.href.replace(/^\//, "") ||
                active === link.label.toLowerCase();
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`text-[0.9rem] font-medium transition-colors duration-200 hover:text-ld-text ${
                      isActive ? "text-ld-text" : "text-ld-text-secondary"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
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
              {PUBLIC_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-3 text-[0.94rem] font-medium text-ld-text-secondary transition-colors hover:bg-ld-accent/8 hover:text-ld-text">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/register" onClick={() => setMenuOpen(false)} className="mt-3 block rounded-[10px] bg-ld-accent py-3 text-center text-[0.92rem] font-semibold text-white">
              Get Started
            </Link>
          </div>
        )}
      </nav>

      {/* Spacer for fixed nav */}
      <div className="h-[78px]" aria-hidden="true" />

      {/* Page content */}
      <main className="mx-auto max-w-[1180px] px-4 py-8 lg:px-7 lg:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-ld-border bg-ld-deep">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-3 px-4 py-6 text-center text-[0.85rem] text-ld-text-muted lg:px-7">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/" className="hover:text-ld-text">Home</Link>
            <Link href="/pricing" className="hover:text-ld-text">Pricing</Link>
            <Link href="/terms" className="hover:text-ld-text">Terms</Link>
            <Link href="/privacy" className="hover:text-ld-text">Privacy</Link>
            <Link href="/risk" className="hover:text-ld-text">Risk Disclosure</Link>
            <Link href="/contact" className="hover:text-ld-text">Contact</Link>
          </div>
          <div>&copy; 2026 Beacontry. All rights reserved.</div>
          <div className="text-[0.78rem]">
            Beacontry is a software tool for market research and trade journaling. It is not a registered
            broker-dealer, investment advisor, or tax professional. Nothing here is investment advice.
          </div>
        </div>
      </footer>
    </div>
  );
}
