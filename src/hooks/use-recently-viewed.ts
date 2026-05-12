"use client";

// Phase B.1 — persistent "recently-viewed symbols" history.
//
// Stored in localStorage under a single key. Up to 8 most-recent symbols,
// ordered newest-first. Click → `push(sym)` and the symbol bumps to the
// top; duplicates are de-duped on push.
//
// Per-device, not per-account, because cross-device portability isn't
// worth the API call+row-write on every click. If we ever want it server-
// backed (e.g. for AI-chat context), the migration is straightforward:
// add a `recent_symbols` text[] column on users and have push() POST
// to /api/me/recent.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sentinel-recently-viewed";
const MAX_ENTRIES = 8;

interface RecentEntry {
  symbol: string;
  at: number; // unix ms — newest sorts first
}

function read(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentEntry =>
          e &&
          typeof e === "object" &&
          typeof e.symbol === "string" &&
          typeof e.at === "number"
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function write(entries: RecentEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage disabled — silently no-op. The next reload
    // just starts fresh, which is acceptable for a navigation aid.
  }
}

export interface UseRecentlyViewed {
  entries: RecentEntry[];
  push: (symbol: string) => void;
  clear: () => void;
}

export function useRecentlyViewed(): UseRecentlyViewed {
  const [entries, setEntries] = useState<RecentEntry[]>([]);

  // Hydrate from localStorage on mount. Avoids SSR/CSR mismatch by starting
  // with an empty array and filling it after the component has mounted.
  useEffect(() => {
    setEntries(read());
  }, []);

  // Cross-tab sync: when another tab updates the list, mirror the change
  // into this tab so the Analysis page Recent panel stays in sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setEntries(read());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const push = useCallback((rawSymbol: string) => {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol) return;
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.symbol !== symbol);
      const next = [{ symbol, at: Date.now() }, ...filtered].slice(0, MAX_ENTRIES);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    write([]);
  }, []);

  return { entries, push, clear };
}
