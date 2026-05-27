"use client";

/**
 * PWA install button — bypasses Chrome's hidden ⋮ → "Install app" menu by
 * capturing `beforeinstallprompt` and driving the native install dialog from
 * a real on-page button. Added 2026-05-27 (PR 25) after a user reported the
 * Chrome Android menu install option missing despite all PWA criteria being
 * met server-side.
 *
 * Behavior matrix:
 *   - Already installed (display-mode: standalone) → renders null
 *   - Browser fires beforeinstallprompt → button visible
 *   - User clicks → fires native install dialog; on "accepted" the button
 *     hides itself
 *   - Browser never fires the event (criteria not met, or unsupported
 *     browser) → button stays hidden so we don't promise functionality
 *     that won't happen
 *
 * iOS Safari does NOT fire `beforeinstallprompt`. For iOS we'd render a
 * separate "Add to Home Screen via Share button" hint. Deferred for v1 —
 * the original report was on Android.
 */

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface Props {
  className?: string;
  /** Hide the text label and show only the download icon. */
  iconOnly?: boolean;
  /** Label text. Default: "Install app". */
  label?: string;
  /** Called when user accepts the install. */
  onInstalled?: () => void;
}

export function PWAInstallButton({
  className = "",
  iconOnly = false,
  label = "Install app",
  onInstalled,
}: Props) {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already running as installed PWA — never show the install button.
    // display-mode: standalone is the W3C-spec indicator that the page is
    // running outside a browser tab.
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches
    ) {
      setInstalled(true);
      return;
    }

    const onBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome's mini-infobar (it's deprecated but some Android
      // builds still show it). We render our own UI instead.
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setEvent(null);
      onInstalled?.();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [onInstalled]);

  if (installed || !event) return null;

  const handleClick = async () => {
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        // The appinstalled listener will fire shortly and reset state;
        // null'ing the event handle pre-emptively hides the button right
        // away so the user gets immediate feedback.
        setEvent(null);
      }
    } catch (err) {
      // Native prompt may throw if called twice or in an unexpected state.
      // Visible in console so Chrome devtools can pick it up.
      console.error("[PWA] install prompt failed:", err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      aria-label={label}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
