"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LogOut,
  Menu,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import {
  NAV_ITEMS,
  isActivePath,
} from "./nav-config";
import { useAi } from "@/components/ai/ai-provider";

function NavSection({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1 px-3">
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 min-h-[44px] ${
              active
                ? "bg-accent/15 text-accent border border-accent/20"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-surface border border-transparent"
            }`}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isChatOpen, toggleChat } = useAi();

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      {/* Hamburger — mobile only */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 lg:hidden p-2 rounded-lg bg-bg-secondary border border-border text-text-secondary hover:text-text-primary hover:bg-bg-surface min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex h-screen bg-bg-primary">
        {/* Desktop sidebar — in-flow flex child */}
        <aside className="hidden lg:flex w-[260px] shrink-0 flex-col bg-bg-secondary border-r border-border">
          {/* Logo */}
          <div className="px-5 py-5 border-b border-border">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center">
                <Shield className="h-5 w-5 text-accent" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-text-primary">
                  Sentinel
                </h1>
                <p className="text-[10px] text-text-muted uppercase tracking-widest">
                  Trading Intelligence
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <div className="flex-1 py-4 overflow-y-auto">
            <NavSection pathname={pathname} />
          </div>

          {/* Footer */}
          <div className="px-3 pb-3 pt-2 border-t border-border space-y-1">
            <button
              type="button"
              onClick={toggleChat}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] ${
                isChatOpen
                  ? "bg-accent/15 text-accent border border-accent/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-surface border border-transparent"
              }`}
            >
              <Sparkles className="h-[18px] w-[18px]" />
              AI Assistant
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-text-muted hover:text-bearish hover:bg-bearish/10 transition-all duration-200 min-h-[44px] border border-transparent"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Sign out
            </button>
            <p className="text-[10px] text-text-muted px-3 pt-1">
              Trading Intelligence Platform
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile sidebar — overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-[280px] bg-bg-secondary border-r border-border flex flex-col z-50 lg:hidden animate-slide-in-left">
            {/* Logo */}
            <div className="px-5 py-5 border-b border-border flex items-center justify-between">
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-accent" strokeWidth={2} />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight text-text-primary">
                    Sentinel
                  </h1>
                  <p className="text-[10px] text-text-muted uppercase tracking-widest">
                    Trading Intelligence
                  </p>
                </div>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-surface min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* Navigation */}
            <div className="flex-1 py-4 overflow-y-auto">
              <NavSection pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>

            {/* Footer */}
            <div className="px-3 pb-3 pt-2 border-t border-border space-y-1">
              <button
                type="button"
                onClick={() => { toggleChat(); setMobileOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-all duration-200 min-h-[44px] border border-transparent"
              >
                <Sparkles className="h-[18px] w-[18px]" />
                AI Assistant
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-text-muted hover:text-bearish hover:bg-bearish/10 transition-all duration-200 min-h-[44px] border border-transparent"
              >
                <LogOut className="h-[18px] w-[18px]" />
                Sign out
              </button>
              <p className="text-[10px] text-text-muted px-3 pt-1">
                Trading Intelligence Platform
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
