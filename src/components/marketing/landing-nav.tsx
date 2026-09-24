"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemePicker } from "@/components/theme-picker";
import { BeacontryMark } from "@/components/brand/beacontry-mark";
import { PWAInstallButton } from "@/components/pwa-install-button";
import { ButtonLink } from "@/components/ui/button-link";

/**
 * The landing page's fixed navbar and its phone menu. Split out of
 * src/app/page.tsx with the scroll and menu state it owns.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#process" },
    // Standalone /pricing page is the canonical pricing surface (full
    // feature-comparison matrix + FAQ). The #pricing teaser further
    // down this landing stays as a quick glance for scroll readers.
    { label: "Pricing", href: "/pricing" },
    { label: "Why Beacontry", href: "#trust" },
    // Anchors the no-account browse card at the bottom of the final
    // CTA section. Lets curious visitors jump straight to it instead
    // of scrolling through the whole landing.
    { label: "Explore Freely", href: "#explore" },
  ];

  return (
    <>
        {/* ── Navbar — exact Dark Moon structure ── */}
        <nav className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,color,box-shadow] duration-200 ${scrolled ? "border-ld-accent/18 bg-ld-deep/94 shadow-pop" : "border-ld-border bg-ld-deep/86"} backdrop-blur-[18px]`}>
          <div className="mx-auto flex min-h-[78px] max-w-[1280px] items-center justify-between gap-4 px-[var(--gutter)]">
            <Link href="/" className="flex items-center gap-3 text-lg font-bold tracking-tight">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ld-accent text-ld-on-accent">
                <BeacontryMark variant="full" className="h-8 w-8" aria-label="Beacontry" />
              </div>
              Beacontry
            </Link>

            <ul className="hidden items-center gap-6 md:flex">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-base font-medium text-ld-text-secondary transition-colors duration-200 hover:text-ld-text">{link.label}</a>
                </li>
              ))}
            </ul>

            <div className="hidden items-center gap-3 md:flex">
              <ThemePicker variant="icon" />
              {/* PWA install — renders nothing unless Chrome fires beforeinstallprompt */}
              <PWAInstallButton
                className="inline-flex items-center gap-2 rounded-lg border border-ld-accent/40 bg-ld-accent/8 px-4 py-3 text-base font-medium text-ld-accent transition-colors duration-200 hover:bg-ld-accent/14"
              />
              <ButtonLink href="/register" className="px-5 text-base">
                Get Started
              </ButtonLink>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <ThemePicker variant="icon" />
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-control text-ld-text"
                aria-label="Menu"
                aria-expanded={menuOpen}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
                </svg>
              </button>
            </div>
          </div>

          {menuOpen && (
            <div className="border-t border-ld-border bg-ld-deep/96 px-5 pb-5 pt-3 backdrop-blur-[18px] md:hidden">
              <ul className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-3 text-base font-medium text-ld-text-secondary transition-colors hover:bg-ld-accent/8 hover:text-ld-text">{link.label}</a>
                  </li>
                ))}
              </ul>
              <Link href="/register" onClick={() => setMenuOpen(false)} className="mt-3 block rounded-lg bg-ld-accent py-3 text-center text-base font-semibold text-ld-on-accent">
                Get Started
              </Link>
              {/* PWA install in the mobile menu — hidden unless the browser
                  fires beforeinstallprompt. This is the path Chrome Android
                  users will actually use (the ⋮-menu "Install app" item
                  doesn't always show). */}
              <PWAInstallButton
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-ld-accent/40 bg-ld-accent/8 py-3 text-center text-base font-medium text-ld-accent"
              />
            </div>
          )}
        </nav>
    </>
  );
}
