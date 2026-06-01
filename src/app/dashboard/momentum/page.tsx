"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignalBadge } from "@/components/ui/signal-badge";
import { SymbolLink } from "@/components/ui/symbol-link";
import { useToast } from "@/components/ui/toast";
import { TraderTierRequired } from "@/components/tiers/trader-tier-required";

// ── Types ──────────────────────────────────────────────────────────

interface GapperCandidate {
  symbol: string;
  price: number;
  gapPct: number;
  rvol: number;
  float: number | null;
  dayVolume: number;
  prevClose: number;
  score: number;
}

interface ScanResponse {
  configured: boolean;
  candidates: GapperCandidate[];
  examined: number;
  skipped: Record<string, number> | null;
  message?: string;
}

interface MomentumPattern {
  consolidationLength: number;
  consolidationHigh: number;
  consolidationLow: number;
  impulsePct: number;
  tightness: number;
  volumeMultiple: number;
  volumeSurge: boolean;
  breakoutPrice: number;
}

interface MomentumResult {
  symbol: string;
  signal: string;
  confidence: number;
  price: number;
  volume: number;
  suggestedStop: number | null;
  pattern: MomentumPattern | null;
  vwap: number | null;
  ema9: number | null;
  ema21: number | null;
  rsi: number | null;
  atr: number | null;
  reasons: string[];
  timestamp: string;
}

interface AnalyzeResponse {
  configured: boolean;
  symbol?: string;
  barCount?: number;
  result?: MomentumResult | null;
  message?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatFloat(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

function pctClass(pct: number): string {
  return pct >= 0 ? "text-bullish" : "text-bearish";
}

// ── Page ───────────────────────────────────────────────────────────

export default function MomentumPage() {
  const [scanning, setScanning] = useState(false);
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, MomentumResult | "loading" | "error">>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // No auto-scan on mount — would race CsrfInit's fetch-patch useEffect
  // (React fires child effects before parent ones, so the POST goes out
  // before the x-csrf-token header injector is installed → "Invalid or
  // missing CSRF token"). User-triggered via the Scan button instead.

  async function runScan() {
    setScanning(true);
    try {
      const res = await fetch("/api/momentum/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          type: "error",
          message:
            body?.error ?? `Scan failed (${res.status}). Check System Config.`,
        });
        return;
      }
      const data = (await res.json()) as ScanResponse;
      setScanData(data);
      setAnalyses({});
      setExpanded(new Set());
    } catch (err) {
      toast({
        type: "error",
        message:
          "Scan failed — " + ((err as Error)?.message ?? "network error"),
      });
    } finally {
      setScanning(false);
    }
  }

  async function runAnalyze(symbol: string) {
    setAnalyses((prev) => ({ ...prev, [symbol]: "loading" }));
    setExpanded((prev) => new Set(prev).add(symbol));
    try {
      const res = await fetch("/api/momentum/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          type: "error",
          message:
            body?.error ?? `Analyze ${symbol} failed (${res.status}).`,
        });
        setAnalyses((prev) => ({ ...prev, [symbol]: "error" }));
        return;
      }
      const data = (await res.json()) as AnalyzeResponse;
      if (!data.configured) {
        toast({
          type: "error",
          message:
            data.message ?? "Polygon not configured — set POLYGON_API_KEY.",
        });
        setAnalyses((prev) => ({ ...prev, [symbol]: "error" }));
        return;
      }
      if (!data.result) {
        toast({
          type: "info",
          message:
            data.message ??
            `${symbol}: no bars returned (markets closed or symbol not covered).`,
        });
        setAnalyses((prev) => ({ ...prev, [symbol]: "error" }));
        return;
      }
      setAnalyses((prev) => ({ ...prev, [symbol]: data.result! }));
    } catch (err) {
      toast({
        type: "error",
        message:
          "Analyze failed — " + ((err as Error)?.message ?? "network error"),
      });
      setAnalyses((prev) => ({ ...prev, [symbol]: "error" }));
    }
  }

  function toggleExpand(symbol: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  const candidates = scanData?.candidates ?? [];
  const signalsCount = Object.values(analyses).filter(
    (a): a is MomentumResult =>
      typeof a === "object" &&
      (a.signal === "BUY" || a.signal === "STRONG_BUY")
  ).length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Trader / Momentum"
        title="Small-Cap Momentum Scanner"
        description="Live gapper feed for the Warrior-style playbook: low-float stocks gapping 5%+ on news with elevated relative volume. Pure browsing — no orders are placed from this page."
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={runScan}
            loading={scanning}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            {scanning ? "Scanning…" : "Scan now"}
          </Button>
        }
        stats={[
          {
            label: "Candidates",
            value: String(candidates.length),
            tone: candidates.length > 0 ? "brand" : "neutral",
          },
          { label: "Examined", value: String(scanData?.examined ?? 0) },
          {
            label: "Analyzer BUYs",
            value: String(signalsCount),
            tone: signalsCount > 0 ? "bullish" : "neutral",
          },
          {
            label: "Polygon",
            value: scanData?.configured ? "Connected" : "Not set",
            tone: scanData?.configured ? "bullish" : "bearish",
          },
        ]}
      />

      <TraderTierRequired />

      {scanData && !scanData.configured && (
        <Card className="border-warning/30 bg-warning/[0.04]">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">
                Polygon.io not configured
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                The momentum scanner needs real-time 1-minute bars for
                small-cap stocks. Yahoo&apos;s 15-minute delay is fatal for
                this strategy. Add a Polygon.io API key via{" "}
                <Link
                  href="/dashboard/admin/system-config"
                  className="text-accent hover:underline"
                >
                  admin → System Config
                </Link>
                . The Developer tier ($79/mo) gives real-time data + unlimited
                API calls.
              </p>
              <p className="text-xs text-text-muted">
                Until then, learn the strategy in the{" "}
                <Link
                  href="/dashboard/education/paths/small-cap-momentum-basics"
                  className="text-accent hover:underline"
                >
                  Small-Cap Momentum learning path
                </Link>
                .
              </p>
            </div>
          </div>
        </Card>
      )}

      {scanData && scanData.configured && candidates.length === 0 && (
        <Card>
          <div className="py-8 text-center space-y-2">
            <Zap className="h-7 w-7 text-text-muted mx-auto" />
            <h3 className="text-sm font-semibold text-text-primary">
              No qualifying gappers right now
            </h3>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              {scanData.message ??
                "Polygon's gainer feed is empty or no symbols passed the filter (price $1–$20, float < 20M, gap ≥ 5%, RVOL ≥ 0.5×). The strategy's primary window is 09:30–10:30 ET."}
            </p>
            {scanData.skipped && (
              <div className="pt-3 text-xs text-text-muted">
                Skipped:{" "}
                {Object.entries(scanData.skipped)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => `${k}=${n}`)
                  .join(" · ") || "none"}
              </div>
            )}
          </div>
        </Card>
      )}

      {candidates.length > 0 && (
        <div className="space-y-2">
          {candidates.map((c) => {
            const isExpanded = expanded.has(c.symbol);
            const analysis = analyses[c.symbol];
            const hasAnalysis = typeof analysis === "object";
            const isAnalyzing = analysis === "loading";
            return (
              <Card key={c.symbol} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(c.symbol)}
                    className="text-text-muted hover:text-accent transition-colors"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <SymbolLink
                    symbol={c.symbol}
                    className="text-sm font-semibold"
                  />
                  <span className="font-mono text-sm text-text-primary">
                    ${c.price.toFixed(2)}
                  </span>
                  <span
                    className={`font-mono text-sm font-semibold ${pctClass(c.gapPct)}`}
                  >
                    {c.gapPct >= 0 ? "+" : ""}
                    {(c.gapPct * 100).toFixed(1)}%
                  </span>
                  <Badge variant="default">
                    RVOL {c.rvol.toFixed(1)}×
                  </Badge>
                  <Badge variant="default">
                    Float {formatFloat(c.float)}
                  </Badge>
                  <span className="text-xs text-text-muted ml-auto">
                    score {c.score.toFixed(2)}
                  </span>
                  {hasAnalysis && (
                    <SignalBadge
                      signal={analysis.signal as "BUY" | "STRONG_BUY" | "HOLD" | "SELL" | "STRONG_SELL"}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => runAnalyze(c.symbol)}
                    loading={isAnalyzing}
                    disabled={isAnalyzing}
                  >
                    <Brain className="h-3.5 w-3.5 mr-1" />
                    {hasAnalysis ? "Re-analyze" : "Analyze"}
                  </Button>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <Stat label="Day volume" value={formatVolume(c.dayVolume)} />
                      <Stat label="Prev close" value={`$${c.prevClose.toFixed(2)}`} />
                      <Stat
                        label="Gap $"
                        value={`$${(c.price - c.prevClose).toFixed(2)}`}
                        tone={c.gapPct >= 0 ? "bullish" : "bearish"}
                      />
                      <Stat label="Float" value={formatFloat(c.float)} />
                    </div>

                    {analysis === "loading" && (
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing intraday 1m bars…
                      </div>
                    )}

                    {analysis === "error" && (
                      <div className="text-sm text-bearish">
                        Analysis unavailable — see toast above.
                      </div>
                    )}

                    {hasAnalysis && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <Stat
                            label="Signal"
                            value={analysis.signal}
                            tone={
                              analysis.signal === "BUY" ||
                              analysis.signal === "STRONG_BUY"
                                ? "bullish"
                                : "neutral"
                            }
                          />
                          <Stat
                            label="Confidence"
                            value={`${(analysis.confidence * 100).toFixed(0)}%`}
                          />
                          <Stat
                            label="RSI(14)"
                            value={
                              analysis.rsi !== null
                                ? analysis.rsi.toFixed(1)
                                : "—"
                            }
                          />
                          <Stat
                            label="Suggested stop"
                            value={
                              analysis.suggestedStop !== null
                                ? `$${analysis.suggestedStop.toFixed(2)}`
                                : "—"
                            }
                          />
                        </div>

                        {analysis.pattern && (
                          <div className="rounded-lg bg-bg-elevated p-3 space-y-1 text-xs">
                            <div className="font-semibold text-text-primary mb-1">
                              Pattern detected
                            </div>
                            <div className="text-text-secondary font-mono">
                              {analysis.pattern.consolidationLength}-bar consolidation
                              after {(analysis.pattern.impulsePct * 100).toFixed(1)}% impulse,
                              tightness {analysis.pattern.tightness.toFixed(2)},
                              breakout volume {analysis.pattern.volumeMultiple.toFixed(1)}×
                              {analysis.pattern.volumeSurge ? (
                                <span className="text-bullish ml-1">
                                  <CheckCircle2 className="inline h-3 w-3" />{" "}
                                  confirmed
                                </span>
                              ) : (
                                <span className="text-warning ml-1">
                                  unconfirmed
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <div className="text-[11px] uppercase tracking-wider text-text-muted">
                            Reasons
                          </div>
                          <ul className="space-y-1 text-xs text-text-secondary">
                            {analysis.reasons.map((r, i) => (
                              <li
                                key={i}
                                className="pl-3 relative before:absolute before:left-0 before:content-['·'] before:text-text-muted"
                              >
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <div className="text-xs text-text-muted leading-relaxed space-y-2">
          <p>
            <strong className="text-text-secondary">Educational only.</strong>{" "}
            This scanner identifies setups that match Sentinel&apos;s
            small-cap momentum criteria. It does not place orders, recommend trades, or
            constitute investment advice. Small-cap momentum trading carries
            substantial risk of loss and is suitable only for traders with
            appropriate risk tolerance and capital. Past patterns do not
            predict future results.
          </p>
          <p>
            Strategy details:{" "}
            <Link
              href="/dashboard/education/paths/small-cap-momentum-basics"
              className="text-accent hover:underline"
            >
              Small-Cap Momentum learning path
            </Link>
            .
          </p>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "bullish" | "bearish";
}) {
  const toneClass =
    tone === "bullish"
      ? "text-bullish"
      : tone === "bearish"
        ? "text-bearish"
        : "text-text-primary";
  return (
    <div className="rounded-lg bg-bg-elevated p-2">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
