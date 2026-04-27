"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, X, Check } from "lucide-react";

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
      const res = await fetch("/api/auth/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to set PIN");
        return;
      }
      setDone(true);
      setTimeout(() => setVisible(false), 2000);
    } catch {
      setError("Failed to set PIN");
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
            <Button size="sm" onClick={() => setExpanded(true)}>Set PIN</Button>
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
