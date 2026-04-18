"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspacePreview } from "@/components/auth/workspace-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Sparkles } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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
        body: JSON.stringify({ name, email, password }),
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

  return (
    <div className="min-h-screen overflow-hidden px-4 py-4 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[18px] border border-border/80 bg-bg-surface shadow-2xl lg:grid-cols-[1.08fr_0.92fr]">
        <WorkspacePreview
          eyebrow="Open your workspace"
          title="Build a trading desk that feels yours."
          description="Create an account to get the scanner, analysis cockpit, trader controls, journal, and community flow inside one continuous workspace."
          protocolTitle="Starter Workflow"
          protocolSteps={[
            "Open with a command center that already understands scan, analysis, execution, and review as one flow.",
            "Shape the desk around the modules you actually use instead of inheriting a generic SaaS dashboard.",
            "Keep expanding the workspace with research, policy, and social surfaces when you need more context.",
          ]}
          stats={[
            { label: "Starter layout", value: "Expanded" },
            { label: "Surface types", value: "Research + Trading" },
          ]}
          lanes={[
            {
              label: "Command center",
              value: "Editable",
              detail: "Start with a denser default desk and adjust the modules around your own process.",
              tone: "brand",
            },
            {
              label: "Analysis flow",
              value: "Integrated",
              detail: "Scanner, analysis, trader, and performance views stay inside the same operating environment.",
              tone: "bullish",
            },
            {
              label: "Review surfaces",
              value: "Ready",
              detail: "Journal, policy, and community pages are already part of the workspace instead of afterthoughts.",
            },
          ]}
        />

        <section className="flex items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-lg space-y-5">
            <div className="rounded-[14px] border border-border/80 bg-bg-surface/68 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.24)] sm:p-8">
              <div className="space-y-3">
                <Link href="/" className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-accent/25 bg-accent/12 text-accent lg:hidden">
                  <Shield className="h-5 w-5" />
                </Link>
                <div className="text-[11px] uppercase tracking-[0.08em] text-accent">Create Account</div>
                <h1 className="font-display text-4xl text-text-primary">Start with a clean desk</h1>
                <p className="text-sm text-text-secondary">Create your Sentinel account and step straight into the workspace.</p>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {error && (
                  <div className="rounded-lg border border-bearish/25 bg-bearish/10 px-4 py-3 text-sm text-bearish animate-scale-in">
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
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="Min 8 chars, letters + numbers"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={fieldErrors.password}
                  required
                  autoComplete="new-password"
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Repeat your password"
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

              <p className="mt-5 text-sm text-text-muted">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-accent transition-colors hover:text-accent-hover">
                  Sign in
                </Link>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[10px] border border-border/70 bg-bg-surface/65 p-4">
                <div className="flex items-center gap-2 text-accent">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-[0.22em]">Starter desk</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  New accounts open with a fuller module mix so the command center does not feel underbuilt.
                </p>
              </div>
              <div className="rounded-[10px] border border-border/70 bg-bg-surface/65 p-4">
                <div className="flex items-center gap-2 text-accent">
                  <Shield className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-[0.22em]">Workspace control</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  You can rebuild the module layout later without losing the underlying workflow.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
