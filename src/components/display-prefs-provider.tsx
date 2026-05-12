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
// Current preference set:
//   - pnlFormat: "dollar" | "percent" | "both"
//   - timeFormat: "12h" | "24h"
//   - colorBlindMode: boolean (swap green→blue, red→orange + add ▲/▼ symbols)
//   - landingPage: which dashboard route to redirect to after login

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
export type TimeFormat = "12h" | "24h";

// Allowed landing pages. Keep the set small — covers what users actually
// open first thing in the morning. /dashboard is the canonical home.
export const LANDING_PAGES = [
  { value: "/dashboard", label: "Dashboard (default)" },
  { value: "/dashboard/trader", label: "Trader" },
  { value: "/dashboard/analysis", label: "Analysis" },
  { value: "/dashboard/screener", label: "Screener" },
  { value: "/dashboard/news", label: "News" },
  { value: "/dashboard/pnl-calendar", label: "P&L Calendar" },
] as const;
export type LandingPage = typeof LANDING_PAGES[number]["value"];

export interface DisplayPrefs {
  pnlFormat: PnlFormat;
  timeFormat: TimeFormat;
  colorBlindMode: boolean;
  landingPage: LandingPage;
}

const DEFAULT_PREFS: DisplayPrefs = {
  pnlFormat: "dollar",
  timeFormat: "24h",
  colorBlindMode: false,
  landingPage: "/dashboard",
};

interface DisplayPrefsContextValue extends DisplayPrefs {
  setPnlFormat: (format: PnlFormat) => void;
  togglePnlFormat: () => void;
  setTimeFormat: (format: TimeFormat) => void;
  setColorBlindMode: (enabled: boolean) => void;
  setLandingPage: (page: LandingPage) => void;
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
    const timeFormat: TimeFormat = parsed.timeFormat === "12h" ? "12h" : "24h";
    const colorBlindMode: boolean = parsed.colorBlindMode === true;
    const landingPage: LandingPage = LANDING_PAGES.some((p) => p.value === parsed.landingPage)
      ? parsed.landingPage
      : "/dashboard";
    return { pnlFormat, timeFormat, colorBlindMode, landingPage };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeStored(prefs: DisplayPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota / disabled — non-critical
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
      writeStored(next);
      return next;
    });
  }, []);

  const togglePnlFormat = useCallback(() => {
    setPrefs((prev) => {
      const order: PnlFormat[] = ["dollar", "percent", "both"];
      const idx = order.indexOf(prev.pnlFormat);
      const nextFormat = order[(idx + 1) % order.length];
      const next = { ...prev, pnlFormat: nextFormat };
      writeStored(next);
      return next;
    });
  }, []);

  const setTimeFormat = useCallback((format: TimeFormat) => {
    setPrefs((prev) => {
      const next = { ...prev, timeFormat: format };
      writeStored(next);
      return next;
    });
  }, []);

  const setColorBlindMode = useCallback((enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, colorBlindMode: enabled };
      writeStored(next);
      return next;
    });
  }, []);

  const setLandingPage = useCallback((page: LandingPage) => {
    setPrefs((prev) => {
      const next = { ...prev, landingPage: page };
      writeStored(next);
      return next;
    });
  }, []);

  // Color-blind mode toggles a body-level class. CSS in globals.css remaps
  // the bullish/bearish accent colors when the class is present.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (prefs.colorBlindMode) {
      document.documentElement.classList.add("colorblind");
    } else {
      document.documentElement.classList.remove("colorblind");
    }
  }, [prefs.colorBlindMode]);

  return (
    <DisplayPrefsContext.Provider
      value={{
        ...prefs,
        setPnlFormat,
        togglePnlFormat,
        setTimeFormat,
        setColorBlindMode,
        setLandingPage,
      }}
    >
      {children}
    </DisplayPrefsContext.Provider>
  );
}

/**
 * Format an ISO timestamp using the user's preferred time format.
 * Returns just the time portion (HH:MM) for compact tables.
 */
export function formatTime(iso: string, format: TimeFormat): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: format === "12h",
    });
  } catch {
    return iso;
  }
}

/**
 * Format an ISO timestamp as a full date+time. For longer formats
 * (e.g. timestamps in tables, audit log).
 */
export function formatDateTime(iso: string, format: TimeFormat): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: format === "12h",
    });
  } catch {
    return iso;
  }
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
