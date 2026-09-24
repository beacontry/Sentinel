"use client";

// /register — sign-up page. Three flows depending on URL params:
//
//   /register                    → public free-tier signup (anonymous)
//   /register?token=...          → invite-token signup (admin-issued;
//                                  email is pre-filled and locked, tier
//                                  is still 'free' on insertion — admin
//                                  upgrades post-signup)
//   /register?plan=trader&...    → public signup WITH plan intent. After
//   /register?plan=premium&...     a successful signup the page forwards
//                                  to /dashboard/billing?upgrade=<tier>
//                                  :<cadence>, which auto-triggers
//                                  Stripe Checkout. Used by the /pricing
//                                  "Start with Trader / Premium" CTAs to
//                                  carry plan intent through registration
//                                  → checkout without dropping users on
//                                  the dashboard with no narrative thread.
//                                  `plan` + `cadence` are CLIENT-SIDE
//                                  UX hints only — the account is still
//                                  created at tier=free server-side, and
//                                  the real grant comes from the Stripe
//                                  webhook on successful payment.
//
// Anti-abuse on the public path:
//   - Server: IP rate-limit + honeypot field + bcrypt cost
//   - Client: honeypot, mailto-style email validation, password matching

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, AuthHeading, AuthError, AuthSwitch } from "@/components/auth/auth-shell";
import { displayPrice, type Cadence } from "@/lib/billing-prices";

type PaidPlan = "trader" | "premium";

function parsePaidPlan(raw: string | null): PaidPlan | null {
  return raw === "trader" || raw === "premium" ? raw : null;
}

function parseCadence(raw: string | null): Cadence {
  return raw === "year" ? "year" : "month";
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <p role="status" className="text-sm text-text-secondary">Loading sign-up…</p>
        </AuthShell>
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
  const plan = parsePaidPlan(searchParams.get("plan"));
  const cadence = parseCadence(searchParams.get("cadence"));
  // Plan-intent UX only fires on the public path (no invite token).
  // Invite-issued accounts are admin-managed; plan intent doesn't apply.
  const planIntent = !token && plan ? { plan, cadence } : null;
  const planPrice = planIntent
    ? displayPrice(planIntent.plan, planIntent.cadence)
    : null;

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
      // Plan intent forwards to billing with an upgrade hint; the billing
      // page reads ?upgrade= and auto-fires Stripe Checkout. Without plan
      // intent the user lands on the dashboard normally.
      if (planIntent) {
        router.push(
          `/dashboard/billing?upgrade=${planIntent.plan}:${planIntent.cadence}`
        );
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  // Invite token present but still validating it
  if (token && validating) {
    return (
      <AuthShell>
        <AuthHeading title="Create account" />
        <p role="status" className="mt-4 text-sm text-text-secondary">
          Checking your invite…
        </p>
      </AuthShell>
    );
  }

  // Invite token present but invalid / expired
  if (token && !inviteValid && error) {
    return (
      <AuthShell>
        <AuthHeading title="This invite cannot be used" />
        <p role="alert" className="mt-4 rounded-lg border border-bearish-line bg-bearish-fill px-3 py-2 text-sm text-bearish-fg">
          {error}
        </p>
        <p className="mt-5 text-sm text-text-secondary">
          You can{" "}
          <Link href="/register" className="font-semibold text-accent hover:underline">
            sign up free
          </Link>{" "}
          without an invite.
        </p>
        <AuthSwitch prompt="Already have an account?" href="/login" label="Sign in" />
      </AuthShell>
    );
  }

  const isInvitePath = !!token;
  const planName = planIntent ? (planIntent.plan === "trader" ? "Trader" : "Premium") : null;

  return (
    <AuthShell>
      <AuthHeading
        title={isInvitePath ? "Create account" : planName ? `Start your ${planName} trial` : "Sign up for free"}
      >
        {isInvitePath
          ? "Set up your trading workspace."
          : planIntent && planPrice
            ? "We will create your account, then take you to secure checkout."
            : "Education, glossary, calculators, Congress trades, daily digest and watchlists. Upgrade when you want the engine."}
      </AuthHeading>
      {planIntent && planPrice ? (
        <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg bg-bg-surface px-4 py-3 text-sm">
          <dt className="text-text-muted">Plan</dt>
          <dd className="font-semibold text-text-primary">
            {planName} {planIntent.cadence === "year" ? "annual" : "monthly"}
          </dd>
          <dt className="text-text-muted">Price</dt>
          <dd className="text-text-primary">{planPrice.label} after a 7-day free trial</dd>
          <dt className="text-text-muted">Cancel</dt>
          <dd className="text-text-primary">Anytime</dd>
        </dl>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <AuthError id="register-error" error={error} />
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
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          required
          autoComplete="new-password"
          enterKeyHint="go"
        />

        {/* Honeypot: off-screen, aria-hidden, tabIndex=-1 and
            autocomplete=off so real users never trip it. Bots that fill
            every form field populate it; the server returns 201 silently. */}
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
          {isInvitePath ? "Create account" : planIntent ? "Continue to checkout" : "Create free account"}
        </Button>

        {!isInvitePath && (
          <p className="text-xs text-text-muted">
            By signing up you agree to the{" "}
            <Link href="/terms" className="underline hover:text-text-secondary">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/risk" className="underline hover:text-text-secondary">
              Risk Disclosure
            </Link>
            . Beacontry is a research and journaling tool, not investment advice.
          </p>
        )}
      </form>

      <AuthSwitch prompt="Already have an account?" href="/login" label="Sign in" />
    </AuthShell>
  );
}
