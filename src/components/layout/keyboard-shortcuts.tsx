"use client";

// Global keyboard shortcuts. Single-key shortcuts trigger only when no
// modifier (Cmd/Ctrl/Alt/Meta) is held AND the user isn't in a text
// input — both common rules so users can type "j" into a search box
// without being teleported to the journal.
//
// Shortcuts:
//   t — Trader
//   a — Analysis
//   s — Screener
//   w — Watchlists
//   j — Journal
//   n — News
//   ? — Help modal (lists all shortcuts)
//
// Cmd/Ctrl+K already opens the Command Palette (handled in
// command-palette.tsx). Don't re-bind here.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalTitle } from "@/components/ui/modal";

interface ShortcutDef {
  key: string;
  href: string;
  label: string;
}

const SHORTCUTS: ShortcutDef[] = [
  { key: "t", href: "/dashboard/trader", label: "Trader" },
  { key: "a", href: "/dashboard/analysis", label: "Analysis" },
  { key: "s", href: "/dashboard/screener", label: "Screener" },
  { key: "w", href: "/dashboard/watchlists", label: "Watchlists" },
  { key: "j", href: "/dashboard/journal", label: "Journal" },
  { key: "n", href: "/dashboard/news", label: "News" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when a modifier is held — those belong to the OS / browser
      // / command palette (Cmd+K).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Ignore when typing into a text input or contentEditable
      if (isTypingTarget(e.target)) return;
      // Ignore when the help modal itself is open (avoid recursion)

      const key = e.key.toLowerCase();
      if (key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (key === "escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }

      const match = SHORTCUTS.find((s) => s.key === key);
      if (match) {
        e.preventDefault();
        router.push(match.href);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, helpOpen]);

  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} className="max-w-sm">
      <ModalHeader>
        <ModalTitle>Keyboard shortcuts</ModalTitle>
      </ModalHeader>
      <div className="px-5 pb-2">
        <p className="text-xs text-text-muted mb-3">
          Single-key shortcuts (without modifiers). Press <kbd className="font-mono text-text-secondary">?</kbd> any time to see this list.
        </p>
        <div className="space-y-1">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-bg-hover"
            >
              <span className="text-sm text-text-secondary">{s.label}</span>
              <kbd className="rounded border border-border bg-bg-elevated px-2 py-0.5 font-mono text-xs text-text-primary">
                {s.key.toUpperCase()}
              </kbd>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-bg-hover">
            <span className="text-sm text-text-secondary">Command palette</span>
            <span className="font-mono text-xs text-text-muted">
              <kbd className="rounded border border-border bg-bg-elevated px-1.5 py-0.5">Ctrl</kbd>
              <span className="mx-0.5">/</span>
              <kbd className="rounded border border-border bg-bg-elevated px-1.5 py-0.5">⌘</kbd>
              <span className="mx-0.5">+</span>
              <kbd className="rounded border border-border bg-bg-elevated px-1.5 py-0.5">K</kbd>
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
