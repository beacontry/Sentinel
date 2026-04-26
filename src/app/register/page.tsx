"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield } from "lucide-react";

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="h-8 w-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    }>
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
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(!!token);
  const [inviteValid, setInviteValid] = useState(false);

  // Validate the invite token on mount
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
        body: JSON.stringify({ name, email, password, token }),
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

  // No token provided
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
                <Shield className="h-4 w-4" />
              </div>
              <span className="text-xl font-semibold text-text-primary">Sentinel</span>
            </Link>
          </div>
          <div className="rounded-xl border border-border bg-bg-secondary p-6 shadow-lg">
            <h1 className="text-xl font-semibold text-text-primary">Invite Required</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Sentinel is invite-only. If you have an invite link, please use it to register.
            </p>
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

  // Validating token
  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="text-center text-text-secondary">Validating invite...</div>
      </div>
    );
  }

  // Invalid token
  if (!inviteValid && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
                <Shield className="h-4 w-4" />
              </div>
              <span className="text-xl font-semibold text-text-primary">Sentinel</span>
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-xl font-semibold text-text-primary">Sentinel</span>
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-bg-secondary p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-text-primary">Create account</h1>
          <p className="mt-1 text-sm text-text-secondary">Set up your trading workspace.</p>

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
              disabled
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
            <Button type="submit" loading={loading} className="w-full">
              Create Account
            </Button>
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
