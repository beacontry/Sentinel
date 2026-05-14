"use client";

// /register — sign-up page. Two flows depending on URL params:
//
//   /register             → public free-tier signup (anonymous, no invite)
//   /register?token=...   → invite-token signup (admin-issued; email is
//                           pre-filled and locked, tier is still 'free'
//                           on insertion — admin upgrades post-signup)
//
// Anti-abuse on the public path:
//   - Server: IP rate-limit + honeypot field + bcrypt cost
//   - Client: honeypot, mailto-style email validation, password matching

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BeacontryMark } from "@/components/brand/beacontry-mark";

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
          <div className="h-8 w-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Honeypot — real users never type here (it's hidden via CSS).
  // Bots that fill every form field will populate it; the server returns
  // 201 without inserting on hit.
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(!!token);
  const [inviteValid, setInviteValid] = useState(false);

  // Validate the invite token on mount (only on the invite path)
  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }

    fetch(`/api/auth/validate-invite?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setInviteValid(true);
          if (data.email) setEmail(data.email);
        } else {
          setError(data.error ?? "Invalid or expired invite.");
        }
      })
      .catch(() => setError("Failed to validate invite."))
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          // Only include token on the invite path. Empty/null on public path.
          ...(token ? { token } : {}),
          // Honeypot — bots set this, real users don't see the field.
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setError(data.error ?? "Registration failed");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  // Invite token present but still validating it
  if (token && validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="text-center text-text-secondary">Validating invite...</div>
      </div>
    );
  }

  // Invite token present but invalid / expired
  if (token && !inviteValid && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
                <BeacontryMark variant="full" className="h-6 w-6" aria-label="Beacontry" />
              </div>
              <span className="text-xl font-semibold text-text-primary">Beacontry</span>
            </Link>
          </div>
          <div className="rounded-xl border border-border bg-bg-secondary p-6 shadow-lg">
            <h1 className="text-xl font-semibold text-text-primary">Invalid Invite</h1>
            <p className="mt-2 text-sm text-bearish">{error}</p>
            <p className="mt-4 text-center text-sm text-text-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
                Sign in
              </Link>
            </p>
            <p className="mt-2 text-center text-sm text-text-muted">
              Or{" "}
              <Link href="/register" className="font-medium text-accent hover:text-accent-hover">
                sign up free
              </Link>
              {" "}without an invite.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isInvitePath = !!token;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <BeacontryMark variant="full" className="h-6 w-6" aria-label="Beacontry" />
            </div>
            <span className="text-xl font-semibold text-text-primary">Beacontry</span>
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-bg-secondary p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-text-primary">
            {isInvitePath ? "Create account" : "Sign up for free"}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {isInvitePath
              ? "Set up your trading workspace."
              : "Free tier — education, glossary, calculators, Congress trades, daily digest, watchlists. Upgrade later when you want the engine."}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="rounded-lg border border-bearish/25 bg-bearish/10 px-3 py-2 text-sm text-bearish">
                {error}
              </div>
            )}
            <Input
              label="Name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fieldErrors.name}
              required
              autoComplete="name"
              autoFocus
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              required
              autoComplete="email"
              // Lock email field on invite path so users can't bypass the
              // "email must match invite" server check by tweaking it.
              disabled={isInvitePath}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              required
              autoComplete="new-password"
            />
            <Input
              label="Confirm Password"
              type="password"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={fieldErrors.confirmPassword}
              required
              autoComplete="new-password"
            />

            {/* Honeypot — absolutely-positioned off-screen + aria-hidden +
                tabIndex=-1 + autocomplete=off so real users never trip it.
                Bots that auto-fill every visible form field will populate
                it; the server returns 201 silently on hit. */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-10000px",
                top: "auto",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              <label htmlFor="website">Website (leave empty)</label>
              <input
                type="text"
                id="website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <Button type="submit" loading={loading} className="w-full">
              {isInvitePath ? "Create Account" : "Create free account"}
            </Button>

            {!isInvitePath && (
              <p className="text-center text-[0.78rem] text-text-muted">
                By signing up you agree to our{" "}
                <Link href="/terms" className="underline hover:text-text-secondary">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/risk" className="underline hover:text-text-secondary">
                  Risk Disclosure
                </Link>
                . Beacontry is a research + journaling tool, not investment advice.
              </p>
            )}
          </form>

          <p className="mt-4 text-center text-sm text-text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
