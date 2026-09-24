"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BeacontryMark } from "@/components/brand/beacontry-mark";

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

/**
 * The sign-in error. Always mounted as role="alert" so a screen reader
 * announces the text when it appears; when there is no error it is an
 * empty, visually hidden region.
 */
function LoginError({ id, error }: { id: string; error: string }) {
  return (
    <div
      id={id}
      role="alert"
      className={error ? "rounded-lg border border-bearish-line bg-bearish-fill px-3 py-2 text-sm text-bearish" : "sr-only"}
    >
      {error}
    </div>
  );
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
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-on-accent">
                <BeacontryMark variant="full" className="h-6 w-6" aria-label="Beacontry" />
              </div>
              <span className="text-xl font-semibold text-text-primary">Beacontry</span>
            </Link>
          </div>

          <div className="rounded-xl border border-border bg-bg-secondary p-6 shadow-pop">
            <div className="text-center mb-5">
              <div aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-muted text-accent text-xl font-bold mb-3">
                {lastUser.name.charAt(0).toUpperCase()}
              </div>
              <h1 className="text-xl font-semibold text-text-primary">Welcome back</h1>
              <p className="mt-1 text-sm text-text-secondary">{lastUser.name}</p>
            </div>

            <form onSubmit={handlePinLogin} className="space-y-4">
              <LoginError id="pin-error" error={error} />
              <Input
                ref={pinRef}
                label="PIN"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "pin-error" : undefined}
                type="password"
                inputMode="numeric"
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
          </div>
        </div>
      </div>
    );
  }

  // ── Standard Login View ──
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-on-accent">
              <BeacontryMark variant="full" className="h-6 w-6" aria-label="Beacontry" />
            </div>
            <span className="text-xl font-semibold text-text-primary">Beacontry</span>
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-bg-secondary p-6 shadow-pop">
          <h1 className="text-xl font-semibold text-text-primary">Sign in</h1>
          <p className="mt-1 text-sm text-text-secondary">Enter your credentials to access the desk.</p>

          <form onSubmit={handlePasswordLogin} className="mt-5 space-y-4">
            <LoginError id="login-error" error={error} />
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
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Button type="submit" loading={loading} className="w-full">
              Sign In
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-text-muted">
            No account?{" "}
            <Link href="/register" className="font-medium text-accent hover:text-accent-hover">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
