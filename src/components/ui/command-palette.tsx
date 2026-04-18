"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Search,
  LogOut,
} from "lucide-react";
import {
  COMMAND_PALETTE_EVENT,
  NAV_ITEMS,
  SUB_NAV,
} from "@/components/layout/nav-config";

// Build a flat list of all navigable pages (main items + sub-nav pages)
function getAllPages() {
  const pages = NAV_ITEMS.map((item) => ({
    href: item.href,
    label: item.label,
    description: item.description,
    icon: item.icon,
    keywords: item.keywords ?? [],
  }));

  // Add sub-nav pages that aren't already in main nav
  const mainHrefs = new Set(pages.map((p) => p.href));
  for (const tabs of Object.values(SUB_NAV)) {
    for (const tab of tabs) {
      if (!mainHrefs.has(tab.href)) {
        pages.push({
          href: tab.href,
          label: tab.label,
          description: "",
          icon: Search,
          keywords: [],
        });
      }
    }
  }

  return pages;
}

const ALL_PAGES = getAllPages();

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
    }

    document.addEventListener(COMMAND_PALETTE_EVENT, handleOpen);
    return () => document.removeEventListener(COMMAND_PALETTE_EVENT, handleOpen);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-bg-primary/80 animate-fade-in"
        onClick={() => setOpen(false)}
      />

      <div className="absolute left-1/2 top-[12%] w-full max-w-2xl -translate-x-1/2 px-4">
        <Command
          className="overflow-hidden rounded-xl border border-border bg-bg-secondary animate-scale-in"
          loop
        >
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 text-text-muted shrink-0" />
            <Command.Input
              placeholder="Find a page, jump to a tool, or run an action..."
              className="h-12 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              autoFocus
            />
            <kbd className="hidden rounded-md border border-border bg-bg-elevated px-2 py-1 font-mono text-[11px] text-text-muted sm:inline-flex">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[28rem] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-text-muted">
              No results found.
            </Command.Empty>

            <Command.Group
              heading="Pages"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2
                [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase
                [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-text-muted
                [&_[cmdk-group-heading]]:font-medium"
            >
              {ALL_PAGES.map((page) => (
                <Command.Item
                  key={page.href}
                  value={`${page.label} ${page.description} ${page.keywords.join(" ")}`}
                  onSelect={() => navigate(page.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                    text-text-secondary outline-none
                    data-[selected=true]:bg-accent/10 data-[selected=true]:text-text-primary
                    transition-colors"
                >
                  <page.icon className="h-4 w-4 shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary">{page.label}</div>
                    {page.description && (
                      <div className="truncate text-xs text-text-muted">
                        {page.description}
                      </div>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Separator className="my-2 h-px bg-border" />
            <Command.Group
              heading="Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2
                [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase
                [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-text-muted
                [&_[cmdk-group-heading]]:font-medium"
            >
              <Command.Item
                value="log out sign out"
                onSelect={handleLogout}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                  text-text-secondary outline-none
                  data-[selected=true]:bg-bearish/10 data-[selected=true]:text-bearish
                  transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Log Out</div>
                  <div className="text-xs text-text-muted">Leave the workspace</div>
                </div>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-text-muted">
            <span>Navigate with <kbd className="font-mono">↑↓</kbd> and <kbd className="font-mono">Enter</kbd></span>
            <span className="font-mono">{ALL_PAGES.length} routes</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
