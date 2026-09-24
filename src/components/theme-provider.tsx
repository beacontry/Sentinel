"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

/**
 * Five-theme system. Each value here is also the CSS class applied to <html>
 * (except "light" which is the implicit default — no class).
 *
 *   light       — default: white surfaces, emerald accent
 *   dark        — original dark mode: emerald-tinted near-black
 *   coral       — light variant: warm peach surfaces, coral accent
 *   light-blue  — light variant: sky-tinted surfaces, blue accent
 *   gray        — dark variant: true neutral grays, emerald accent retained
 *
 * Adding a new theme is: extend the union, add a CSS block in globals.css,
 * add an entry to THEME_META, that's it.
 */
export type Theme = "light" | "dark" | "coral" | "light-blue" | "gray";

export const THEME_META: Record<
  Theme,
  { label: string; isDark: boolean; pwaColor: string; swatch: string; description: string }
> = {
  light: {
    label: "Light",
    isDark: false,
    pwaColor: "#f0f5f2",
    swatch: "#006f47", // emerald accent, light fill
    description: "Classic white surfaces, emerald accent",
  },
  dark: {
    label: "Dark",
    isDark: true,
    pwaColor: "#07120d",
    swatch: "#15ba81", // emerald accent on emerald-tinted dark
    description: "Emerald-tinted dark, easy on the eyes",
  },
  coral: {
    label: "Coral",
    isDark: false,
    pwaColor: "#faf1ee",
    swatch: "#a63c0c", // coral accent, oklch(50% 0.15 40)
    description: "Warm peach surfaces, coral accent",
  },
  "light-blue": {
    label: "Light Blue",
    isDark: false,
    pwaColor: "#eff4fa",
    swatch: "#1e59cd",
    description: "Cool sky tints, blue accent",
  },
  gray: {
    label: "Gray",
    isDark: true,
    pwaColor: "#0f0f0f",
    swatch: "#989898",
    description: "True neutral grays, no chromatic tint",
  },
};

/**
 * Helper: does this theme render as dark (for embeds like TradingView that
 * need their own dark/light flag)?
 */
export function isDarkTheme(theme: Theme): boolean {
  return THEME_META[theme]?.isDark ?? false;
}

const ALL_THEME_CLASSES: Theme[] = ["dark", "coral", "light-blue", "gray"];
const VALID_THEMES = new Set<Theme>(["light", "dark", "coral", "light-blue", "gray"]);

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Cycles through themes in declaration order (legacy callers). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "sentinel-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Read from localStorage on mount. Accept any of the 5 valid themes;
  // anything else (including the old "light"/"dark" values) just maps to
  // itself or falls back to "dark" for unknown junk.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_THEMES.has(stored as Theme)) {
      setThemeState(stored as Theme);
    }
    setMounted(true);
  }, []);

  // Sync class to <html>, update PWA theme-color, and persist. A layout
  // effect, so the class is in place before any child's passive effect
  // reads the CSS tokens (PriceChart remounts on a theme change).
  useLayoutEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;

    // Strip any prior theme class, then add the current one (except for
    // "light" which is the implicit default = no class).
    for (const cls of ALL_THEME_CLASSES) {
      root.classList.remove(cls);
    }
    if (theme !== "light") {
      root.classList.add(theme);
    }

    localStorage.setItem(STORAGE_KEY, theme);

    // Update PWA theme-color meta tag for browser chrome
    const themeColor = THEME_META[theme]?.pwaColor ?? "#07120d";
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) {
      meta.content = themeColor;
    } else {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = themeColor;
      document.head.appendChild(meta);
    }
  }, [theme, mounted]);

  const setTheme = (t: Theme) => setThemeState(t);

  // Legacy toggleTheme cycles through all 5 in declaration order. Existing
  // callsites that just want "flip light/dark" continue to work (they
  // cycle through all options now, which is the expected behavior for
  // anyone clicking a "next theme" button repeatedly).
  const themeOrder: Theme[] = ["light", "dark", "coral", "light-blue", "gray"];
  const toggleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setThemeState(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
