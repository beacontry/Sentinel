"use client";

// Global display preferences. Stored in localStorage so they apply
// instantly on next render (no async fetch) and persist across tabs via
// the storage event. If we ever want cross-device sync, pair this with
// a DB write on change — the existing user_preferences table already has
// a spot.
//
// Current preference set:
//   - pnlFormat: "dollar" | "percent" | "both"
//
// More toggles (24h time, decimal separator, color-blind palette) will
// land here in Batch 5 — keep the contract small until we need them.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

const STORAGE_KEY = "sentinel-display-prefs";

export type PnlFormat = "dollar" | "percent" | "both";

export interface DisplayPrefs {
  pnlFormat: PnlFormat;
}

const DEFAULT_PREFS: DisplayPrefs = {
  pnlFormat: "dollar",
};

interface DisplayPrefsContextValue extends DisplayPrefs {
  setPnlFormat: (format: PnlFormat) => void;
  togglePnlFormat: () => void;
}

const DisplayPrefsContext = createContext<DisplayPrefsContextValue | null>(null);

function readStored(): DisplayPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFS;
    const pnlFormat: PnlFormat =
      parsed.pnlFormat === "percent" || parsed.pnlFormat === "both"
        ? parsed.pnlFormat
        : "dollar";
    return { pnlFormat };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function DisplayPrefsProvider({ children }: { children: ReactNode }) {
  // Start with defaults on SSR; hydrate after mount so server + client
  // match. The brief default → stored flip is invisible because all
  // consumers re-render on the same hydration cycle.
  const [prefs, setPrefs] = useState<DisplayPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(readStored());
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setPrefs(readStored());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPnlFormat = useCallback((format: PnlFormat) => {
    setPrefs((prev) => {
      const next = { ...prev, pnlFormat: format };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Quota / disabled — non-critical
      }
      return next;
    });
  }, []);

  const togglePnlFormat = useCallback(() => {
    setPrefs((prev) => {
      // dollar → percent → both → dollar …
      const order: PnlFormat[] = ["dollar", "percent", "both"];
      const idx = order.indexOf(prev.pnlFormat);
      const nextFormat = order[(idx + 1) % order.length];
      const next = { ...prev, pnlFormat: nextFormat };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Quota — fine
      }
      return next;
    });
  }, []);

  return (
    <DisplayPrefsContext.Provider value={{ ...prefs, setPnlFormat, togglePnlFormat }}>
      {children}
    </DisplayPrefsContext.Provider>
  );
}

export function useDisplayPrefs(): DisplayPrefsContextValue {
  const ctx = useContext(DisplayPrefsContext);
  if (!ctx) {
    throw new Error("useDisplayPrefs must be used inside DisplayPrefsProvider");
  }
  return ctx;
}

/**
 * Format a P&L value according to the user's preference. Pass the dollar
 * amount + a basis (cost basis, equity at start of day, etc.) to derive
 * the percent.
 *
 * If `basis` is undefined or zero, falls back to dollar-only regardless of
 * the user's chosen format — percentage is undefined without a basis.
 */
export function formatPnl(
  amountUsd: number,
  basis: number | undefined,
  format: PnlFormat
): string {
  const sign = amountUsd >= 0 ? "+" : "";
  const dollar = `${sign}$${Math.abs(amountUsd).toFixed(2)}`;
  if (!basis || basis === 0 || format === "dollar") {
    return amountUsd >= 0 ? dollar : `-$${Math.abs(amountUsd).toFixed(2)}`;
  }
  const pct = (amountUsd / basis) * 100;
  const pctStr = `${sign}${pct.toFixed(2)}%`;
  if (format === "percent") return pctStr;
  // "both"
  return `${dollar} (${pctStr})`;
}
