"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDrawerA11y } from "@/hooks/useDrawerA11y";
import {
  LogOut,
  Menu,
  Sparkles,
  X,
} from "lucide-react";
import { BeacontryMark } from "@/components/brand/beacontry-mark";
import {
  isActivePath,
  visibleNavItems,
} from "./nav-config";
import { useTier } from "@/components/tiers/tier-gate";
import { useAi } from "@/components/ai/ai-provider";
import { ThemePicker } from "@/components/theme-picker";
import { BrokerSwitcher } from "./broker-switcher";
import { PnlFormatToggle } from "./pnl-format-toggle";
import { SidebarTierBadge } from "@/components/tiers/sidebar-tier-badge";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isChatOpen, toggleChat } = useAi();
  // Filter the sidebar based on the user's role — admin-only items are
  // hidden from non-admins entirely (rather than showing them with a
  // permission-denied page when clicked). Loading state shows the
  // unfiltered list briefly which is fine; the admin page itself
  // server-side enforces role.
  const { role } = useTier();
  const navItems = visibleNavItems(role);

  // Mobile drawer a11y — focus trap, restore on close, dialog semantics.
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  useDrawerA11y({
    open: mobileOpen,
    containerRef: mobileDrawerRef,
    closeRef: mobileCloseRef,
  });

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setMobileOpen(false); }
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", handleKey); };
  }, [mobileOpen]);

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

      <div style={{ display: "flex", height: "100vh" }}>
        {/* Desktop sidebar */}
        <aside
          data-app-sidebar
          className="hidden lg:flex"
          style={{ width: 260, flexShrink: 0, backgroundColor: "var(--color-bg-elevated)", flexDirection: "column", height: "100vh", overflow: "hidden" }}
        >
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Logo */}
            <div style={{ padding: "14px 16px 10px" }}>
              <Link href="/dashboard" className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
                  <BeacontryMark className="h-4 w-4" aria-label="Beacontry" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>Beacontry</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Trading Intelligence</div>
                </div>
              </Link>
            </div>

            {/* Active broker switcher */}
            <BrokerSwitcher />

            {/* Nav items */}
            <nav style={{ flex: 1, overflowY: "auto", padding: "4px 10px" }}>
              {navItems.map((item) => {
                const active = isActivePath(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 10px",
                      borderRadius: 6,
                      fontSize: 13,
                      color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      backgroundColor: active ? "var(--color-bg-hover)" : "transparent",
                      fontWeight: active ? 500 : 400,
                      textDecoration: "none",
                      marginBottom: 1,
                    }}
                  >
                    <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div style={{ padding: "4px 10px 12px" }}>
              <SidebarTierBadge />
              <div style={{ marginBottom: 6 }}>
                <ThemePicker variant="sidebar" />
              </div>
              <PnlFormatToggle />
              <button
                type="button"
                onClick={toggleChat}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 6,
                  fontSize: 13,
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  color: isChatOpen ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  backgroundColor: isChatOpen ? "var(--color-bg-hover)" : "transparent",
                }}
              >
                <Sparkles style={{ width: 16, height: 16 }} />
                AI Assistant
              </button>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 6,
                  fontSize: 13,
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  backgroundColor: "transparent",
                  marginTop: 1,
                }}
              >
                <LogOut style={{ width: 16, height: 16 }} />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0, overflowY: "auto", backgroundColor: "var(--color-bg-primary)" }}>
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside
            ref={mobileDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            className="fixed left-0 top-0 bottom-0 z-50 lg:hidden animate-slide-in-left focus:outline-none"
            style={{ width: 280, backgroundColor: "var(--color-bg-elevated)", display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>Menu</span>
              <button
                ref={mobileCloseRef}
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", cursor: "pointer", color: "var(--color-text-secondary)", backgroundColor: "transparent" }}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* Logo */}
            <div style={{ padding: "8px 16px 10px" }}>
              <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
                  <BeacontryMark className="h-4 w-4" aria-label="Beacontry" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>Beacontry</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Trading Intelligence</div>
                </div>
              </Link>
            </div>

            {/* Active broker switcher (mobile) */}
            <BrokerSwitcher />

            <nav style={{ flex: 1, overflowY: "auto", padding: "4px 10px" }}>
              {navItems.map((item) => {
                const active = isActivePath(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 10px",
                      borderRadius: 6,
                      fontSize: 13,
                      color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      backgroundColor: active ? "var(--color-bg-hover)" : "transparent",
                      fontWeight: active ? 500 : 400,
                      textDecoration: "none",
                      marginBottom: 1,
                    }}
                  >
                    <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div style={{ padding: "4px 10px 12px" }}>
              <SidebarTierBadge />
              <div style={{ marginBottom: 6 }}>
                <ThemePicker variant="sidebar" />
              </div>
              <button
                type="button"
                onClick={() => { toggleChat(); setMobileOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                  borderRadius: 6, fontSize: 13, width: "100%", border: "none", cursor: "pointer",
                  color: "var(--color-text-secondary)", backgroundColor: "transparent",
                }}
              >
                <Sparkles style={{ width: 16, height: 16 }} />
                AI Assistant
              </button>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                  borderRadius: 6, fontSize: 13, width: "100%", border: "none", cursor: "pointer",
                  color: "var(--color-text-secondary)", backgroundColor: "transparent", marginTop: 1,
                }}
              >
                <LogOut style={{ width: 16, height: 16 }} />
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
