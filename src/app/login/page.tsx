"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspacePreview } from "@/components/auth/workspace-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Lock, LayoutDashboard } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Login failed");
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
    <div className="min-h-screen bg-bg-primary p-4 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] overflow-hidden rounded-xl border border-border bg-bg-surface lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[1fr_1fr]">
        <WorkspacePreview
          eyebrow="Welcome back"
          title="Pick up the desk where you left it."
          description="Sign back in to reopen the scanner, execution desk, and review loop without rebuilding the workflow from scratch."
          protocolTitle="Reentry Flow"
          protocolSteps={[
            "Reopen the command center with your saved module layout and recent routes intact.",
            "Drop straight into screener, analysis, or execution depending on what the session needs.",
            "Keep the review loop continuous instead of bouncing between disconnected tools.",
          ]}
          stats={[
            { label: "Workspace mode", value: "Persistent" },
            { label: "Desk surfaces", value: "12" },
          ]}
          lanes={[
            {
              label: "Market focus",
              value: "Live",
              detail: "Scanner, alerts, and macro calendar stay within one operating shell.",
              tone: "bullish",
            },
            {
              label: "Execution",
              value: "Connected",
              detail: "Trader, portfolio, and performance views stay one step away instead of buried in a menu.",
              tone: "brand",
            },
            {
              label: "Review loop",
              value: "Continuous",
              detail: "Journal, policy, and community surfaces reopen in the same workspace context.",
            },
          ]}
        />

        <section className="flex items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-md space-y-5">
            <div className="rounded-xl border border-border bg-bg-secondary p-6 shadow-xl sm:p-8">
              <div className="space-y-3">
                <Link
                  href="/"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent lg:hidden"
                >
                  <Shield className="h-4.5 w-4.5" />
                </Link>

                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
                  Sign In
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                  Return to the desk
                </h1>
                <p className="text-sm leading-relaxed text-text-secondary">
                  Use your Sentinel account to reopen the workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {error && (
                  <div className="animate-scale-in rounded-lg border border-bearish/25 bg-bearish/10 px-4 py-3 text-sm text-bearish">
                    {error}
                  </div>
                )}

                <Input
                  label="Email"
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
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />

                <Button type="submit" size="lg" loading={loading} className="w-full">
                  Sign In
                </Button>
              </form>

              <p className="mt-5 text-center text-sm text-text-muted">
                Don&apos;t have an account?{" "}
                <Link
                  href="/register"
                  className="font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  Create one
                </Link>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-bg-secondary p-4">
                <div className="flex items-center gap-2 text-accent">
                  <Lock className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em]">
                    Session security
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  Authentication reopens the desk without changing your saved module configuration.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-bg-secondary p-4">
                <div className="flex items-center gap-2 text-accent">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em]">
                    Live workspace
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  Analysis, screener, trader, journal, and community surfaces reopen in one continuous shell.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
