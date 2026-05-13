"use client";

import { useEffect, type ReactNode } from "react";
import { X, Minimize2 } from "lucide-react";

/**
 * Full-viewport overlay for chart-like content.
 *
 * Renders its children inside a fixed-position container that covers the
 * entire viewport. Designed for "zoom" / "fullscreen" toggles on the
 * Analysis page's chart area (both the Engine view and the embedded
 * TradingView widget).
 *
 * Behavior:
 *  - Escape closes
 *  - Click on the dim background does NOT close (charts often need clicks)
 *  - Close button top-right always visible
 *  - Locks body scroll while open
 *  - Sets `z-index: 60` — higher than CommandPalette (50) but lower than
 *    Toast (also 50, but appears bottom-right and is rare during a
 *    chart inspection)
 *
 * Backed by the Maximize2 / Minimize2 affordance pair so the entry/exit
 * is visually obvious.
 */
interface ChartFullscreenOverlayProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function ChartFullscreenOverlay({
  open,
  onClose,
  title,
  children,
}: ChartFullscreenOverlayProps) {
  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Chart fullscreen"}
      className="fixed inset-0 z-[60] bg-bg-primary animate-fade-in"
    >
      {/* Toolbar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-bg-primary/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          {title && (
            <span className="text-sm font-semibold text-text-primary truncate">
              {title}
            </span>
          )}
          <span className="text-xs text-text-muted hidden sm:inline">
            Press Esc to exit
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit fullscreen"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Exit</span>
          <X className="w-3.5 h-3.5 sm:hidden" />
        </button>
      </div>

      {/* Chart slot — fills remaining viewport below the toolbar */}
      <div className="absolute inset-0 pt-[52px]">
        {children}
      </div>
    </div>
  );
}
