"use client";

import { useEffect, useRef, useState } from "react";
import { Palette, Check, ChevronDown } from "lucide-react";
import { useTheme, THEME_META, type Theme } from "@/components/theme-provider";

const THEME_ORDER: Theme[] = ["light", "dark", "coral", "light-blue", "gray"];

/**
 * Compact theme picker.
 *
 * Two presentations:
 *  - `variant="sidebar"`: a button styled to match the existing sidebar
 *    "Light Mode" / "Dark Mode" button. Opens an upward popover with all
 *    five themes.
 *  - `variant="icon"`: a 36-40px icon button (palette icon) suitable for
 *    landing nav and mobile contexts. Opens a downward popover.
 *
 * Each popover entry shows a colored swatch + label + a check for the
 * active theme. Click to apply instantly. Closes on outside-click or Esc.
 */
export function ThemePicker({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "icon";
}) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentMeta = THEME_META[theme];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            width: "100%",
            padding: "7px 10px",
            borderRadius: 8,
            background: "transparent",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: currentMeta.swatch,
                border: "1px solid var(--color-border)",
                flexShrink: 0,
              }}
            />
            {currentMeta.label}
          </span>
          <ChevronDown style={{ width: 14, height: 14 }} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Choose theme"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-ld-border text-ld-text-secondary transition-all duration-200 hover:-translate-y-0.5"
        >
          <Palette className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div
          role="listbox"
          aria-label="Themes"
          style={{
            position: "absolute",
            ...(variant === "sidebar"
              ? { bottom: "calc(100% + 6px)", left: 0, right: 0 }
              : { top: "calc(100% + 6px)", right: 0, minWidth: 220 }),
            zIndex: 50,
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: 4,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
          }}
        >
          {THEME_ORDER.map((t) => {
            const meta = THEME_META[t];
            const active = t === theme;
            return (
              <button
                key={t}
                role="option"
                aria-selected={active}
                onClick={() => {
                  setTheme(t);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: active ? "var(--color-accent-muted)" : "transparent",
                  border: "none",
                  color: active ? "var(--color-accent)" : "var(--color-text-primary)",
                  fontSize: 13,
                  textAlign: "left",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--color-bg-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: meta.swatch,
                    border: "1px solid var(--color-border)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontWeight: active ? 600 : 400 }}>
                  {meta.label}
                </span>
                {active && (
                  <Check style={{ width: 14, height: 14 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
