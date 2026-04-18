"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LogOut,
  Menu,
  Radar,
  Sparkles,
  X,
} from "lucide-react";
import {
  NAV_ITEMS,
  isActivePath,
} from "./nav-config";
import { useAi } from "@/components/ai/ai-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isChatOpen, toggleChat } = useAi();

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
          className="hidden lg:block"
          style={{ width: 260, flexShrink: 0, backgroundColor: "#1e293b", display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}
        >
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Logo */}
            <div style={{ padding: "20px 20px 12px" }}>
              <Link href="/dashboard" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
                  <Radar className="h-5 w-5" />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>Sentinel</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Trading Intelligence</div>
                </div>
              </Link>
            </div>

            {/* Nav items */}
            <nav style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontSize: 14,
                      color: active ? "#fff" : "rgba(255,255,255,0.7)",
                      backgroundColor: active ? "rgba(255,255,255,0.1)" : "transparent",
                      fontWeight: active ? 500 : 400,
                      textDecoration: "none",
                      marginBottom: 2,
                    }}
                  >
                    <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div style={{ padding: "8px 16px 16px" }}>
              <button
                type="button"
                onClick={toggleChat}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 14,
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  color: isChatOpen ? "#fff" : "rgba(255,255,255,0.7)",
                  backgroundColor: isChatOpen ? "rgba(255,255,255,0.1)" : "transparent",
                }}
              >
                <Sparkles style={{ width: 18, height: 18 }} />
                AI Assistant
              </button>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 14,
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.7)",
                  backgroundColor: "transparent",
                  marginTop: 2,
                }}
              >
                <LogOut style={{ width: 18, height: 18 }} />
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
            className="fixed left-0 top-0 bottom-0 z-50 lg:hidden animate-slide-in-left"
            style={{ width: 280, backgroundColor: "#1e293b", display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Menu</span>
              <button
                onClick={() => setMobileOpen(false)}
                style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", backgroundColor: "transparent" }}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* Logo */}
            <div style={{ padding: "8px 20px 12px" }}>
              <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
                  <Radar className="h-5 w-5" />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>Sentinel</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Trading Intelligence</div>
                </div>
              </Link>
            </div>

            <nav style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontSize: 14,
                      color: active ? "#fff" : "rgba(255,255,255,0.7)",
                      backgroundColor: active ? "rgba(255,255,255,0.1)" : "transparent",
                      fontWeight: active ? 500 : 400,
                      textDecoration: "none",
                      marginBottom: 2,
                    }}
                  >
                    <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div style={{ padding: "8px 16px 16px" }}>
              <button
                type="button"
                onClick={() => { toggleChat(); setMobileOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  borderRadius: 8, fontSize: 14, width: "100%", border: "none", cursor: "pointer",
                  color: "rgba(255,255,255,0.7)", backgroundColor: "transparent",
                }}
              >
                <Sparkles style={{ width: 18, height: 18 }} />
                AI Assistant
              </button>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  borderRadius: 8, fontSize: 14, width: "100%", border: "none", cursor: "pointer",
                  color: "rgba(255,255,255,0.7)", backgroundColor: "transparent", marginTop: 2,
                }}
              >
                <LogOut style={{ width: 18, height: 18 }} />
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
