"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, AuthHeading, AuthError, AuthSwitch } from "@/components/auth/auth-shell";

const LAST_USER_KEY = "sentinel-last-user";

interface LastUser {
  email: string;
  name: string;
}

// Read the user's chosen landing page from the same localStorage key
// DisplayPrefsProvider writes. Login page isn't inside the provider tree
// so it reads directly — a tiny duplication but avoids restructuring the
// auth shell. Falls back to /dashboard on missing/corrupt data.
const ALLOWED_LANDING = new Set([
  "/dashboard",
  "/dashboard/trader",
  "/dashboard/analysis",
  "/dashboard/screener",
  "/dashboard/news",
  "/dashboard/pnl-calendar",
]);
function getLandingPage(): string {
  if (typeof window === "undefined") return "/dashboard";
  try {
    const raw = window.localStorage.getItem("sentinel-display-prefs");
    if (!raw) return "/dashboard";
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.landingPage === "string" && ALLOWED_LANDING.has(parsed.landingPage)) {
      return parsed.landingPage;
    }
  } catch {
    // fall through
  }
  return "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // PIN mode state
  const [lastUser, setLastUser] = useState<LastUser | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  // Check for returning user with PIN
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_USER_KEY);
      if (!stored) return;
      const user = JSON.parse(stored) as LastUser;
      setLastUser(user);
      setEmail(user.email);

      // Check if this user has a PIN set
      fetch(`/api/auth/has-pin?email=${encodeURIComponent(user.email)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.hasPin) {
            setHasPin(true);
            setPinMode(true);
          }
        })
        .catch(() => {});
    } catch { /* ignore corrupt localStorage */ }
  }, []);

  // Auto-focus PIN input
  useEffect(() => {
    if (pinMode && pinRef.current) {
      pinRef.current.focus();
    }
  }, [pinMode]);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      // Store last user for PIN re-auth
      localStorage.setItem(LAST_USER_KEY, JSON.stringify({
        email: data.user?.email ?? email,
        name: data.user?.name ?? email,
      }));
      router.push(getLandingPage());
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handlePinLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lastUser!.email, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid PIN");
        setPin("");
        if (res.status === 429) {
          // Rate limited — force full login
          setPinMode(false);
        }
        return;
      }
      router.push(getLandingPage());
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  function switchToFullLogin() {
    setPinMode(false);
    setPin("");
    setError("");
    setPassword("");
  }

  function switchUser() {
    localStorage.removeItem(LAST_USER_KEY);
    setLastUser(null);
    setHasPin(false);
    setPinMode(false);
    setEmail("");
    setPassword("");
    setPin("");
    setError("");
  }

  // ── PIN Login View ──
  if (pinMode && lastUser && hasPin) {
    return (
      <AuthShell>
        <div className="flex items-center gap-4">
          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bg-surface text-lg font-semibold text-accent">
            {lastUser.name.charAt(0).toUpperCase()}
          </div>
          <AuthHeading title="Welcome back">{lastUser.name}</AuthHeading>
        </div>

        <form onSubmit={handlePinLogin} className="mt-6 space-y-4">
          <AuthError id="pin-error" error={error} />
          <Input
            ref={pinRef}
            label="PIN"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "pin-error" : undefined}
            type="password"
            inputMode="numeric"
            enterKeyHint="go"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="Enter your PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            autoComplete="off"
          />
          <Button type="submit" loading={loading} className="w-full">
            Unlock
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Button type="button" variant="ghost" size="sm" onClick={switchToFullLogin} className="-ml-3">
            Use password
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={switchUser} className="-mr-3">
            Not {lastUser.name.split(" ")[0]}?
          </Button>
        </div>
      </AuthShell>
    );
  }

  // ── Standard Login View ──
  return (
    <AuthShell>
      <AuthHeading title="Sign in">Enter your credentials to open the desk.</AuthHeading>

      <form onSubmit={handlePasswordLogin} className="mt-6 space-y-4">
        <AuthError id="login-error" error={error} />
        <Input
          label="Email"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
        />
        <Input
          label="Password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          type="password"
          enterKeyHint="go"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>

      <AuthSwitch prompt="No account?" href="/register" label="Create one" />
    </AuthShell>
  );
}
