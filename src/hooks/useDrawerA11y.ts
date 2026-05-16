"use client";

// Accessibility hook for non-modal-Dialog drawers (PositionDetailSheet,
// SymbolPreviewSheet, etc.) — adds the three things Radix would give
// us for free if we used Dialog.Content with modal={true}, without
// retrofitting Radix into existing 300-line drawer components:
//
//   1. Initial focus moves into the drawer when it opens (defaults to
//      the close button via the `closeRef`; otherwise the drawer
//      container itself so screen readers announce the opening).
//   2. Tab navigation is trapped inside the drawer until it closes,
//      so a sighted keyboard user can't accidentally tab back to the
//      page behind the overlay.
//   3. Focus is restored to whatever was focused before the drawer
//      opened (typically the trigger button) on close.
//
// Callers also remember to set `aria-modal="true"` + `role="dialog"`
// on the drawer container — this hook handles the runtime focus
// behavior, the static attributes are a separate concern.

import { useEffect, type RefObject } from "react";

interface UseDrawerA11yOptions {
  /** Whether the drawer is currently open. */
  open: boolean;
  /** Ref to the outermost focusable element of the drawer (used for
   *  Tab-trap boundary detection). */
  containerRef: RefObject<HTMLElement | null>;
  /** Optional ref to the close button — focused on open for
   *  immediate keyboard access. */
  closeRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDrawerA11y({ open, containerRef, closeRef }: UseDrawerA11yOptions): void {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    // Save the element that had focus before the drawer opened so we
    // can restore on close.
    const previousActive = document.activeElement as HTMLElement | null;

    // Initial focus: close button if provided, else the container
    // itself (it'll need tabIndex={-1} to receive focus).
    const target = closeRef?.current ?? container;
    target.focus({ preventScroll: true });

    // Trap Tab key navigation within the drawer.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null); // skip hidden
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        // Shift+Tab from the first focusable → wrap to last
        if (active === first || !container!.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab from the last focusable → wrap to first
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus on close
      if (previousActive && typeof previousActive.focus === "function") {
        previousActive.focus({ preventScroll: true });
      }
    };
  }, [open, containerRef, closeRef]);
}
