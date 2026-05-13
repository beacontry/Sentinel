"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, X, Check } from "lucide-react";

/**
 * Pre-warm the CSRF cookie before a mutating request. Reports of "Invalid
 * or missing CSRF token" on PIN setup traced back to cases where the
 * dashboard-layout-level `CsrfInit`'s eager `/api/csrf` fetch had not yet
 * settled when the user submitted, or the cookie had expired between
 * sessions for low-activity users. Belt-and-suspenders: every place that
 * does its own mutating fetch should call this first.
 */
async function ensureCsrfCookie(): Promise<void> {
  // If a well-formed cookie already exists, skip the network call.
  const m = typeof document !== "undefined"
    ? document.cookie.match(/(?:^|;\s*)csrf-token=([0-9a-f]{64})/)
    : null;
  if (m) return;
  try {
    await fetch("/api/csrf", { credentials: "same-origin" });
  } catch {
    // If this fails, the POST below will fail too — let that error surface.
  }
}

export function PinSetupBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Check if user already has a PIN or dismissed the banner
    const dismissed = sessionStorage.getItem("pin-banner-dismissed");
    if (dismissed) return;

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) return;
        return fetch(`/api/auth/has-pin?email=${encodeURIComponent(data.user.email)}`);
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data && !data.hasPin) {
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  /**
   * Pre-warm CSRF the moment the user expands the form. Gives us a few
   * seconds of headroom while they type their PIN before submit.
   */
  async function handleExpand() {
    setExpanded(true);
    await ensureCsrfCookie();
  }

  async function handleSetPin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (pin.length < 4 || pin.length > 6) {
      setError("PIN must be 4-6 digits");
      return;
    }
    if (pin !== confirm) {
      setError("PINs don't match");
      return;
    }

    setSaving(true);
    try {
      // Belt: re-verify the cookie right before the POST. If the expand
      // pre-warm failed silently, this catches it. If both this and the
      // pre-warm failed, the POST will surface a clear error below.
      await ensureCsrfCookie();

      let res = await fetch("/api/auth/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      // Suspenders: explicit retry on a CSRF 403 with a forced cookie
      // refresh. CsrfInit also self-heals on 403, but it caches some
      // state at the module level — in rare cases (StrictMode double-
      // mount, hot-reload during dev) that cache can be stale on the
      // first request from a freshly-mounted component. A no-frills
      // explicit retry here removes that as a possible cause.
      if (res.status === 403) {
        try {
          // Force a fresh cookie via the no-cookie path inside ensureCsrfCookie
          if (typeof document !== "undefined") {
            // Briefly clear local match by overwriting the cookie value
            // with an empty-but-still-present cookie won't work in JS,
            // so just refetch /api/csrf unconditionally.
            await fetch("/api/csrf", { credentials: "same-origin", cache: "no-store" });
          }
          res = await fetch("/api/auth/set-pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin }),
          });
        } catch {
          /* fall through to the !res.ok handler */
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Translate the technical error into something the user can act on.
        if (res.status === 403 && typeof data?.error === "string" && data.error.toLowerCase().includes("csrf")) {
          setError("Session got out of sync. Reload the page and try again — your login is fine.");
        } else if (res.status === 401) {
          setError("Your session expired. Reload and sign in again.");
        } else {
          setError(data.error ?? "Failed to set PIN");
        }
        return;
      }
      setDone(true);
      setTimeout(() => setVisible(false), 2000);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function dismiss() {
    sessionStorage.setItem("pin-banner-dismissed", "1");
    setVisible(false);
  }

  if (!visible) return null;

  if (done) {
    return (
      <div className="mx-4 mt-3 lg:mx-6 rounded-lg border border-bullish/20 bg-bullish/10 px-4 py-3 flex items-center gap-3 text-sm text-bullish">
        <Check className="h-4 w-4 shrink-0" />
        PIN set. You can now unlock with your PIN next time.
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 lg:mx-6 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <KeyRound className="h-4 w-4 shrink-0 text-accent" />
          <span className="text-text-primary">
            <strong>Set a PIN</strong> for quick sign-in on this device.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && (
            <Button size="sm" onClick={handleExpand}>Set PIN</Button>
          )}
          <button onClick={dismiss} className="text-text-muted hover:text-text-secondary p-1" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <form onSubmit={handleSetPin} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="PIN (4-6 digits)"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              autoFocus
            />
          </div>
          <div className="flex-1">
            <Input
              label="Confirm PIN"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Repeat PIN"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </div>
          <Button type="submit" loading={saving} className="min-h-[44px]">Save PIN</Button>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-bearish">{error}</p>}
    </div>
  );
}
