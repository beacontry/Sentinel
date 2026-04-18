"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspacePreview } from "@/components/auth/workspace-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Sparkles } from "lucide-react";

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
    <div className="min-h-screen overflow-hidden px-4 py-4 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[18px] border border-border/80 bg-bg-surface shadow-2xl lg:grid-cols-[1.08fr_0.92fr]">
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
          <div className="w-full max-w-lg space-y-5">
            <div className="rounded-[14px] border border-border/80 bg-bg-surface/68 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.24)] sm:p-8">
              <div className="space-y-3">
                <Link href="/" className="inline-flex items-center justify-center h-12 w-12 rounded-[18px] border border-accent/25 bg-accent/12 text-accent lg:hidden">
                  <Shield className="h-5 w-5" />
                </Link>
                <div className="text-[11px] uppercase tracking-[0.08em] text-accent">Sign In</div>
                <h1 className="font-display text-4xl text-text-primary">Return to the desk</h1>
                <p className="text-sm text-text-secondary">Use your Sentinel account to reopen the workspace.</p>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {error && (
                  <div className="rounded-lg border border-bearish/25 bg-bearish/10 px-4 py-3 text-sm text-bearish animate-scale-in">
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

                <Button type="submit" loading={loading} className="w-full">
                  Sign In
                </Button>
              </form>

              <p className="mt-5 text-sm text-text-muted">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="font-medium text-accent transition-colors hover:text-accent-hover">
                  Create one
                </Link>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[10px] border border-border/70 bg-bg-surface/65 p-4">
                <div className="flex items-center gap-2 text-accent">
                  <Shield className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-[0.22em]">Session security</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  Authentication reopens the desk without changing your saved module configuration.
                </p>
              </div>
              <div className="rounded-[10px] border border-border/70 bg-bg-surface/65 p-4">
                <div className="flex items-center gap-2 text-accent">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-[11px] uppercase tracking-[0.22em]">Live workspace</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
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
