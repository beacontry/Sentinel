"use client";

// Horizontal top-nav alternative to AppShell. Same data sources
// (NAV_ITEMS, SUB_NAV, visibleNavItems, visibleSubNav, isActivePath)
// so admin filtering and active highlighting behave identically.
//
// To revert: change the import in src/app/dashboard/layout.tsx back to
// AppShell. AppShell is left fully intact.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDrawerA11y } from "@/hooks/useDrawerA11y";
import {
  ChevronDown,
  LogOut,
  Menu,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { BeacontryMark } from "@/components/brand/beacontry-mark";
import {
  isActivePath,
  SUB_NAV,
  visibleNavItems,
  visibleSubNav,
  type NavItem,
  type SubNavTab,
} from "./nav-config";
import { useTier } from "@/components/tiers/tier-gate";
import { useAi } from "@/components/ai/ai-provider";
import { ThemePicker } from "@/components/theme-picker";
import { PWAInstallButton } from "@/components/pwa-install-button";
import { BrokerSwitcher } from "./broker-switcher";
import { PnlFormatToggle } from "./pnl-format-toggle";
import { SidebarTierBadge } from "@/components/tiers/sidebar-tier-badge";

// NAV_ITEMS doesn't carry its SUB_NAV key directly; map by href so
// nav-config.ts can stay unmodified (cleaner revert).
const SUB_NAV_KEY_FOR_HREF: Record<string, keyof typeof SUB_NAV | undefined> = {
  "/dashboard/analysis": "analysis",
  "/dashboard/trader": "trader",
  "/dashboard/journal": "journal",
  "/dashboard/news": "research",
  "/dashboard/calendar": "macro",
  "/dashboard/feed": "community",
  "/dashboard/admin": "admin",
};

function getSubTabs(item: NavItem, role: string | null | undefined): SubNavTab[] {
  const key = SUB_NAV_KEY_FOR_HREF[item.href];
  if (!key) return [];
  return visibleSubNav(SUB_NAV[key], role);
}

export function TopNavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useTier();
  const { isChatOpen, toggleChat } = useAi();
  const navItems = visibleNavItems(role);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSectionHref, setOpenSectionHref] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navContainerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<number | null>(null);

  // Mobile drawer a11y — focus trap, restore on close, dialog semantics.
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  useDrawerA11y({
    open: mobileOpen,
    containerRef: mobileDrawerRef,
    closeRef: mobileCloseRef,
  });

  // Body scroll lock + Escape for mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen]);

  // Close section dropdowns + user menu on outside click / Escape
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (navContainerRef.current && !navContainerRef.current.contains(target)) {
        setOpenSectionHref(null);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenSectionHref(null);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Close everything on route change
  useEffect(() => {
    setOpenSectionHref(null);
    setUserMenuOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  const cancelHoverClose = () => {
    if (hoverCloseTimer.current != null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };
  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverCloseTimer.current = window.setTimeout(() => setOpenSectionHref(null), 150);
  };

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 lg:hidden flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-secondary text-text-secondary shadow-sm"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex flex-col h-screen">
        {/* Desktop top bar */}
        <header
          data-app-topnav
          className="hidden lg:flex sticky top-0 z-30 border-b border-border bg-bg-elevated"
          style={{ minHeight: 52, flexShrink: 0 }}
        >
          <div className="flex w-full items-center gap-2 px-4 py-1.5">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 mr-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
                <BeacontryMark className="h-3.5 w-3.5" aria-label="Beacontry" />
              </div>
              <span className="text-[14px] font-semibold text-text-primary">Beacontry</span>
            </Link>

            {/* Nav sections with dropdowns */}
            {/* overflow-x-auto would clip the dropdowns vertically (per CSS
                spec, overflow-x:auto implies overflow-y:clip). Use flex-wrap
                so a too-wide nav wraps instead of scrolling. */}
            <nav
              ref={navContainerRef}
              className="relative flex flex-wrap items-center gap-0.5 flex-1 min-w-0"
            >
              {navItems.map((item) => {
                const subTabs = getSubTabs(item, role);
                const hasSubTabs = subTabs.length > 0;
                const active = isActivePath(item, pathname);
                const isOpen = openSectionHref === item.href;

                if (!hasSubTabs) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] whitespace-nowrap transition-colors ${
                        active
                          ? "text-text-primary bg-bg-hover font-medium"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60"
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {item.label}
                    </Link>
                  );
                }

                return (
                  <div
                    key={item.href}
                    className="relative"
                    onMouseEnter={() => {
                      cancelHoverClose();
                      setOpenSectionHref(item.href);
                    }}
                    onMouseLeave={scheduleHoverClose}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenSectionHref(isOpen ? null : item.href)}
                      aria-haspopup="menu"
                      aria-expanded={isOpen}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] whitespace-nowrap transition-colors ${
                        active
                          ? "text-text-primary bg-bg-hover font-medium"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60"
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {item.label}
                      <ChevronDown
                        className={`h-3 w-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isOpen && (
                      <div
                        role="menu"
                        className="absolute left-0 top-full mt-1 z-40 min-w-[200px] rounded-lg border border-border bg-bg-elevated shadow-lg py-1"
                        onMouseEnter={cancelHoverClose}
                        onMouseLeave={scheduleHoverClose}
                      >
                        {/* "Overview" link — go to the section root */}
                        <Link
                          href={item.href}
                          role="menuitem"
                          className={`block px-3 py-1.5 text-[13px] transition-colors ${
                            pathname === item.href
                              ? "text-text-primary bg-bg-hover font-medium"
                              : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60"
                          }`}
                        >
                          {item.label} Overview
                        </Link>
                        <div className="my-1 border-t border-border" />
                        {subTabs.map((tab) => {
                          const tabActive = pathname === tab.href;
                          return (
                            <Link
                              key={tab.href}
                              href={tab.href}
                              role="menuitem"
                              className={`block px-3 py-1.5 text-[13px] transition-colors ${
                                tabActive
                                  ? "text-text-primary bg-bg-hover font-medium"
                                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60"
                              }`}
                            >
                              {tab.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Right side: broker, AI, theme, user menu */}
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <div className="hidden xl:block">
                <BrokerSwitcher />
              </div>
              <button
                type="button"
                onClick={toggleChat}
                aria-label="Toggle AI assistant"
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isChatOpen
                    ? "text-text-primary bg-bg-hover"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60"
                }`}
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <ThemePicker variant="icon" />

              {/* User menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label="Account menu"
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    userMenuOpen
                      ? "text-text-primary bg-bg-hover"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60"
                  }`}
                >
                  <User className="h-4 w-4" />
                </button>
                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 z-40 w-[240px] rounded-lg border border-border bg-bg-elevated shadow-lg p-2"
                  >
                    <div className="px-1 pb-1">
                      <SidebarTierBadge />
                    </div>
                    {/* Show broker switcher inside the menu on narrow viewports
                        where it's hidden from the top bar (xl: above) */}
                    <div className="xl:hidden px-1 pb-1">
                      <BrokerSwitcher />
                    </div>
                    <div className="px-1">
                      <PWAInstallButton className="mb-1.5 flex w-full items-center justify-center gap-2 rounded-md border border-accent/30 bg-accent/8 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/14" />
                      <PnlFormatToggle />
                    </div>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-text-secondary hover:text-text-primary hover:bg-bg-hover/60 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main
          className="flex-1 min-w-0 overflow-y-auto"
          style={{ backgroundColor: "var(--color-bg-primary)" }}
        >
          {children}
        </main>
      </div>

      {/* Mobile drawer — unchanged structure from AppShell so muscle memory holds */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            ref={mobileDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            className="fixed left-0 top-0 bottom-0 z-50 lg:hidden animate-slide-in-left focus:outline-none flex flex-col"
            style={{ width: 280, backgroundColor: "var(--color-bg-elevated)" }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-text-primary">Menu</span>
              <button
                ref={mobileCloseRef}
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 pb-2.5">
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
                  <BeacontryMark className="h-4 w-4" aria-label="Beacontry" />
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-text-primary">Beacontry</div>
                  <div className="text-[10px] text-text-muted">Trading Intelligence</div>
                </div>
              </Link>
            </div>

            <BrokerSwitcher />

            <nav className="flex-1 overflow-y-auto px-2.5 py-1">
              {navItems.map((item) => {
                const active = isActivePath(item, pathname);
                const subTabs = getSubTabs(item, role);
                return (
                  <div key={item.href} className="mb-0.5">
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] ${
                        active
                          ? "text-text-primary bg-bg-hover font-medium"
                          : "text-text-secondary"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span>{item.label}</span>
                    </Link>
                    {subTabs.length > 0 && (
                      <div className="ml-7 mt-0.5 mb-1.5 flex flex-col gap-0.5">
                        {subTabs.map((tab) => {
                          const tabActive = pathname === tab.href;
                          return (
                            <Link
                              key={tab.href}
                              href={tab.href}
                              onClick={() => setMobileOpen(false)}
                              className={`rounded-md px-2.5 py-1 text-[12px] ${
                                tabActive
                                  ? "text-text-primary bg-bg-hover font-medium"
                                  : "text-text-muted"
                              }`}
                            >
                              {tab.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="px-2.5 pb-3 pt-1">
              <SidebarTierBadge />
              <div className="mb-1.5">
                <ThemePicker variant="sidebar" />
              </div>
              <PWAInstallButton className="mb-1.5 flex w-full items-center justify-center gap-2 rounded-md border border-accent/30 bg-accent/8 px-3 py-2 text-xs font-medium text-accent" />
              <button
                type="button"
                onClick={() => {
                  toggleChat();
                  setMobileOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-text-secondary"
              >
                <Sparkles className="h-4 w-4" />
                AI Assistant
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-text-secondary"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
