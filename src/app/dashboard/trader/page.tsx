"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePolling } from "@/hooks/usePolling";
import { useRecoveryPoll } from "@/hooks/useRecoveryPoll";
import { accessRegained } from "@/lib/recovery-poll";
import { POLLING_INTERVALS } from "@/lib/config";
import { isMarketOpen } from "@/lib/market-hours";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/toast";
import { useConfirmAction } from "@/components/ui/confirm-action-modal";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { PositionDetailSheet } from "@/components/dashboard/position-detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageIntro } from "@/components/layout/page-intro";
import { TraderTierRequired } from "@/components/tiers/trader-tier-required";
import {
  AlertTriangle,
  Square,
  Play,
  XCircle,
  Settings,
  RefreshCw,
  Check,
  Shield,
} from "lucide-react";
import { PRESET_LABELS } from "@/lib/strategy-presets";
import { formatSignedUsd } from "@/lib/format-pnl";
import { SignedValue } from "@/components/ui/signed-value";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/ui/live-region";
import { ErrorState } from "@/components/ui/error-state";
import { timeAgo, usd, type TraderData, type TraderPosition } from "@/components/trader/types";
import { PositionsTable } from "@/components/trader/positions-table";
import { OpenOrdersTable } from "@/components/trader/open-orders-table";
import { RecentSignals, RecentTrades } from "@/components/trader/recent-activity";
import { AccountReadout, PerformanceAnalytics, PnlReadout } from "@/components/trader/account-readout";
import { TraderTaxCallouts } from "@/components/trader/tax-callouts";
import {
  accessLossStatus,
  applyEngineResponse,
  connectionStat,
  createResponseSequencer,
  diffRiskProfile,
  emptyRiskForm,
  engineControls,
  hasLoaded,
  initialLoadState,
  loadFailed,
  loadStarted,
  loadSucceeded,
  mtmToggleBody,
  profileToRiskForm,
  refreshFailureMessage,
  resumeModeFor,
  riskFormToEngineParams,
  syncedPickerMode,
  type AccessLoss,
  type LoadState,
} from "@/lib/trader-view";

// "Adaptive" doesn't have its own strategy preset — it picks one of the 7
// base modes per-scan from market regime. Label it inline.
const ADAPTIVE_MODE_LABEL = "Adaptive (auto-switches based on VIX + SPY regime)";

// User-facing mode picker. conservative / moderate / aggressive stay
// in the EngineMode enum because the adaptive regime classifier maps
// to them at runtime, but they aren't directly selectable any more —
// users pick adaptive if they want regime-driven behavior. Intraday
// was removed from the enum entirely.
const ENGINE_MODES: { value: string; label: string }[] = [
  ...[
    "optimized", "tactical", "tactical-smart",
  ].map(key => ({
    value: key,
    label: `${PRESET_LABELS[key as keyof typeof PRESET_LABELS]?.label ?? key} (${PRESET_LABELS[key as keyof typeof PRESET_LABELS]?.description ?? ""})`,
  })),
  { value: "adaptive", label: ADAPTIVE_MODE_LABEL },
];


async function sendCommand(
  command: string,
  payload: Record<string, unknown> = {},
): Promise<{ status?: string; error?: string; queuedForOpen?: boolean; message?: string }> {
  try {
    const res = await fetch("/api/trader/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, ...payload }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // A refusal must always carry a string error, whatever its body shape
      // (the tier gate and the shutdown refusal answer an object).
      const error =
        (typeof body?.error === "string" && body.error) ||
        (typeof body?.error?.message === "string" && body.error.message) ||
        `Command failed (${res.status})`;
      return { ...(body ?? {}), error };
    }
    return body ?? { error: "Empty response from the command route" };
  } catch {
    return { error: "Failed to send command" };
  }
}

interface EngineStatus {
  running: boolean;
  halted: boolean;
  mode?: string;
  lastScanAt: string | null;
  scanCount: number;
  positionCount: number;
  dailyLoss: number;
  errors: string[];
  isOwner?: boolean;
  // Phase 3 — live-trading safeguards
  environment?: "paper" | "live" | null;
  bootEquity?: number | null;
  bootAccountNumber?: string | null;
  dailyNotional?: number;
  consecutiveLosses?: number;
  liveTradingAllowed?: boolean;
  // Phase 5 — personalized live-trading protections
  mtmElected?: boolean;
  washSaleProtectionEnabled?: boolean;
  washSaleBlockedCount?: number;
  // Adaptive mode — populated only when mode === "adaptive"
  effectiveMode?: string | null;
  adaptiveRegime?: {
    regime: "risk_on" | "neutral" | "risk_off";
    vix: number;
    spyPrice: number;
    spyMA50: number;
    spyMA200: number;
    breadthScore?: number;
    reasons: string[];
    updatedAt: string;
  } | null;
}

interface TaxStatus {
  hasTraderTaxStatus: boolean;
  mtmElectionYear: number | null;
  mtmDeclaredAt: string | null;
  notes: string | null;
}

export default function TraderPage() {
  const { pnlFormat } = useDisplayPrefs();
  const { toast } = useToast();
  const { requestConfirm, dialog: confirmDialog } = useConfirmAction();
  const [data, setData] = useState<TraderData | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  // Dashboard + engine refresh state. A failed refresh keeps the last data
  // on screen but marks it; a failed first load is an error, not the
  // connect-a-broker empty state.
  const [dashLoad, setDashLoad] = useState<LoadState>(initialLoadState);
  // The dashboard answered 402: the plan does not include the trader desk.
  const [tierRequired, setTierRequired] = useState(false);
  // Access lost (401/402/403 on a primary read, or the session-expired
  // event): private state is cleared and the generation bumped, so a
  // response already in flight cannot repaint it.
  const [accessLost, setAccessLost] = useState<AccessLoss | null>(null);
  const genRef = useRef(0);
  // Orders dashboard loads; see load().
  const [loadSeq] = useState(createResponseSequencer);
  const [cmdLoading, setCmdLoading] = useState<string | null>(null);
  const [engineMode, setEngineMode] = useState<string>("optimized");
  // The picker follows the running engine's mode until the user picks one,
  // so a reload never offers Switch (a restart in the default mode) where
  // Stop belongs.
  const [modeTouched, setModeTouched] = useState(false);
  useEffect(() => {
    setEngineMode((m) => syncedPickerMode(m, modeTouched, engine?.mode));
  }, [engine?.mode, modeTouched]);
  // Persist showRisk across reloads — power-user QoL. Reads from localStorage
  // on mount (after hydration to avoid SSR mismatch) and writes on toggle.
  const [showRisk, setShowRisk] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowRisk(window.localStorage.getItem("sentinel-trader-show-risk") === "1");
  }, []);
  function setShowRiskPersisted(next: boolean) {
    setShowRisk(next);
    try {
      window.localStorage.setItem("sentinel-trader-show-risk", next ? "1" : "0");
    } catch {
      // Quota — non-critical
    }
  }
  // Batch 2 — position detail side-sheet. Stores the symbol currently
  // open (or null). Click on any position row to populate.
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  // The form stays disabled until the saved profile has loaded: a Save from
  // a blank, unloaded form used to overwrite every stored override with
  // null. riskLoaded is the snapshot the Save diffs against.
  const [riskForm, setRiskForm] = useState<Record<string, string>>(emptyRiskForm);
  const [riskLoaded, setRiskLoaded] = useState<Record<string, string>>(emptyRiskForm);
  const [riskLoad, setRiskLoad] = useState<LoadState>(initialLoadState);
  const [riskSaveError, setRiskSaveError] = useState<string | null>(null);
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskSaved, setRiskSaved] = useState(false);

  // Phase 18 — AI trade summary UI state
  const [summarizing, setSummarizing] = useState<Set<string>>(new Set());
  const [summaryByTradeId, setSummaryByTradeId] = useState<Record<string, string>>({});

  // Phase 5 — MTM election state, loaded from /api/tax-status. The checkbox
  // stays disabled until the status has loaded, so it never re-asserts from
  // an unknown state.
  const [taxStatus, setTaxStatus] = useState<TaxStatus | null>(null);
  const [taxLoad, setTaxLoad] = useState<LoadState>(initialLoadState);
  const [mtmSaving, setMtmSaving] = useState(false);

  async function loadTaxStatus() {
    const gen = genRef.current;
    setTaxLoad(loadStarted);
    try {
      const res = await fetch("/api/tax-status");
      if (gen !== genRef.current) return;
      const lost = accessLossStatus(res.status);
      if (lost) {
        loseAccess(lost);
        return;
      }
      if (!res.ok) {
        setTaxLoad((s) => loadFailed(s, `Could not load your tax election (${res.status}).`));
        return;
      }
      const json = await res.json();
      if (gen !== genRef.current) return;
      setTaxStatus(json);
      setTaxLoad((s) => loadSucceeded(s, Date.now()));
    } catch {
      if (gen === genRef.current) setTaxLoad((s) => loadFailed(s, "Could not load your tax election."));
    }
  }

  async function toggleMtm(next: boolean) {
    if (!hasLoaded(taxLoad)) return;
    setMtmSaving(true);
    try {
      const res = await fetch("/api/tax-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Notes are left out so the route keeps them; a re-assert keeps the
        // prior election year.
        body: JSON.stringify(mtmToggleBody(next, taxStatus, new Date().getFullYear())),
      });
      if (res.ok) {
        setTaxStatus(await res.json());
        // Engine reads tax status at start; the wash-sale set refreshes on
        // the next scan (capped at 5 min).
        toast({ type: "success", message: "Tax election saved. It applies on the next engine start." });
      } else {
        toast({ type: "error", message: `Could not save your tax election (${res.status}). Nothing changed.` });
      }
    } catch {
      toast({ type: "error", message: "Could not save your tax election (network error). Nothing changed." });
    } finally {
      setMtmSaving(false);
    }
  }

  function loseAccess(code: AccessLoss) {
    genRef.current++;
    setData(null);
    setEngine(null);
    setTaxStatus(null);
    // The loads go back to not-loaded with the data, so the MTM checkbox and
    // the risk form stay disabled until they are read again. Left "ready"
    // over an empty snapshot, a tick of the checkbox would send the current
    // year and overwrite a prior election year, and the form would show
    // every stored cap as engine-decided.
    setTaxLoad(initialLoadState());
    setRiskForm(emptyRiskForm());
    setRiskLoaded(emptyRiskForm());
    setRiskLoad(initialLoadState());
    setSummaryByTradeId({});
    setDetailSymbol(null);
    setTierRequired(code === 402);
    setAccessLost(code);
    setLoading(false);
  }

  // csrf-init dispatches session-expired on a 401 before its redirect
  // delay; wipe the screen then rather than after.
  useEffect(() => {
    const onExpired = () => loseAccess(401);
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, []);

  async function load() {
    const gen = genRef.current;
    const stale = () => gen !== genRef.current;
    // The poll and the post-command refresh share one generation, so the
    // fence alone does not order them: a poll issued before Start/Stop/Halt
    // can resolve after the refresh and repaint the pre-command engine
    // state. Each load takes a sequence number and one older than the newest
    // already applied is dropped whole.
    const seq = loadSeq.next();
    try {
      const [dashRes, engRes] = await Promise.allSettled([
        fetch("/api/trader/dashboard"),
        fetch("/api/trader/engine"),
      ]);
      if (stale()) return;
      const lost =
        accessLossStatus(dashRes.status === "fulfilled" ? dashRes.value.status : null) ??
        accessLossStatus(engRes.status === "fulfilled" ? engRes.value.status : null);
      // Bodies are read before anything is applied, so the sequence check
      // below covers the whole response rather than half of it.
      const dashJson =
        !lost && dashRes.status === "fulfilled" && dashRes.value.ok ? await dashRes.value.json() : undefined;
      const engJson =
        !lost && engRes.status === "fulfilled" && engRes.value.ok ? await engRes.value.json() : undefined;
      if (stale() || !loadSeq.accept(seq)) return;
      if (lost) {
        loseAccess(lost);
        return;
      }
      let failure: string | null = null;
      if (dashJson !== undefined) {
        setData(dashJson);
        setTierRequired(false);
        setAccessLost(null);
      } else {
        failure = refreshFailureMessage(
          "Dashboard",
          dashRes.status === "fulfilled" ? dashRes.value.status : null,
        );
      }
      if (engJson !== undefined) {
        setEngine(applyEngineResponse<EngineStatus>(engJson));
      } else {
        failure ??= refreshFailureMessage(
          "Engine status",
          engRes.status === "fulfilled" ? engRes.value.status : null,
        );
      }
      setDashLoad((s) => (failure ? loadFailed(s, failure) : loadSucceeded(s, Date.now())));
    } catch {
      if (!stale() && loadSeq.accept(seq)) {
        setDashLoad((s) => loadFailed(s, refreshFailureMessage("Dashboard", null)));
      }
    } finally {
      if (!stale()) setLoading(false);
    }
  }

  // Initial load (mount only; the loaders read state through refs and setters)
  useEffect(() => {
    load();
    loadTaxStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for updates
  usePolling(load, POLLING_INTERVALS.traderDashboard, { enabled: accessLost === null });
  // A 402 is also what a tier-read outage answers (getUserTier falls back to
  // free), and a 403 what a role-read outage answers, so neither is final:
  // keep re-checking with backoff and let the first good load() restore the
  // page. A 401 is a real sign-out; csrf-init redirects to login.
  useRecoveryPoll(load, accessLost === 402 || accessLost === 403);

  // Load saved risk profile overrides
  async function loadRiskProfile() {
    const gen = genRef.current;
    setRiskLoad(loadStarted);
    try {
      const res = await fetch("/api/risk-profile");
      if (gen !== genRef.current) return;
      const lost = accessLossStatus(res.status);
      if (lost) {
        loseAccess(lost);
        return;
      }
      if (!res.ok) {
        setRiskLoad((s) => loadFailed(s, `Could not load your saved overrides (${res.status}).`));
        return;
      }
      const { profile } = await res.json();
      if (gen !== genRef.current) return;
      // A null profile means every field is engine-decided: a real answer.
      const form = profileToRiskForm(profile);
      setRiskForm(form);
      setRiskLoaded(form);
      setRiskLoad((s) => loadSucceeded(s, Date.now()));
    } catch {
      if (gen === genRef.current) setRiskLoad((s) => loadFailed(s, "Could not load your saved overrides."));
    }
  }

  useEffect(() => {
    loadRiskProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Access came back (a good load() after a denial): the tax election and
  // the risk profile were cleared on the way out and nothing else reloads
  // them, and a load dropped by the generation fence mid-flight never
  // finished. Read both again.
  const prevAccessLostRef = useRef<AccessLoss | null>(null);
  useEffect(() => {
    const prev = prevAccessLostRef.current;
    prevAccessLostRef.current = accessLost;
    if (!accessRegained(prev, accessLost)) return;
    loadTaxStatus();
    loadRiskProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLost]);

  async function handleEngine(
    action: "start" | "stop" | "halt" | "switch",
    mode: string = engineMode,
  ): Promise<{ ok: boolean; error?: string; message?: string }> {
    setCmdLoading(action);
    let outcome: { ok: boolean; error?: string; message?: string } = { ok: true };
    try {
      const res = await fetch("/api/trader/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        outcome = {
          ok: false,
          error:
            body?.error?.message ||
            (typeof body?.error === "string" ? body.error : null) ||
            `Engine command failed (${res.status})`,
        };
      } else {
        const body = await res.json().catch(() => null);
        if (typeof body?.data?.message === "string") outcome.message = body.data.message;
        // The engine now runs in (or stopped from) the mode it reports; let
        // the picker follow it again.
        setModeTouched(false);
      }
      // Refresh through the same path as the poll, so the engine status is
      // unwrapped from its { data } envelope exactly once.
      await load();
    } catch {
      outcome = { ok: false, error: "Network error — the engine may not have received the command." };
    }
    setCmdLoading(null);
    return outcome;
  }

  /** Asks for an AI summary of one trade; the list shows it under the row. */
  async function summarizeTrade(tradeId: string) {
    setSummarizing((prev) => new Set(prev).add(tradeId));
    try {
      const res = await fetch("/api/trader/summarize-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId }),
      });
      if (res.ok) {
        const body = await res.json();
        setSummaryByTradeId((prev) => ({ ...prev, [tradeId]: body.summary }));
      } else {
        const body = await res.json().catch(() => ({}));
        toast({
          type: "error",
          message: body?.error || `AI summary failed (${res.status}) — check admin → System Config`,
        });
      }
    } catch (err) {
      toast({
        type: "error",
        message: "AI summary failed — " + ((err as Error)?.message ?? "network error"),
      });
    } finally {
      setSummarizing((prev) => {
        const next = new Set(prev);
        next.delete(tradeId);
        return next;
      });
    }
  }

  /** Close one position: confirm with its numbers, then market-sell it. */
  function confirmClosePosition(p: TraderPosition) {
    requestConfirm({
      title: `Close ${p.symbol}`,
      description: <>Market-sells the full position. Its broker stop is cancelled as the sell fills.</>,
      summary: [
        { label: "Shares", value: String(p.quantity ?? 0) },
        { label: "Current price", value: `$${(p.currentPrice ?? 0).toFixed(2)}` },
        { label: "Est. proceeds", value: usd((p.currentPrice ?? 0) * (p.quantity ?? 0)) },
        {
          label: "Unrealized P&L",
          value: formatSignedUsd(p.unrealizedPnl ?? 0),
          tone: (p.unrealizedPnl ?? 0) >= 0 ? "bullish" : "bearish",
        },
      ],
      confirmLabel: `Sell ${p.quantity} ${p.symbol}`,
      onConfirm: async () => {
        setCmdLoading("flatten");
        const result = await sendCommand("flatten", { symbol: p.symbol });
        setCmdLoading(null);
        if (result.error) throw new Error(result.error);
        toast({ type: "success", message: result.queuedForOpen && result.message ? result.message : `Sell order for ${p.symbol} submitted.` });
        await load();
      },
    });
  }

  if (loading) {
    // Skeleton of the real layout (status strip + stat grid + two tables)
    // instead of a bare centered spinner — the most-visited page shouldn't
    // flash empty. Shapes mirror the loaded page so nothing jumps.
    return (
      <LoadingRegion label="the trader dashboard" busy className="p-4 lg:p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-11 w-64" rounded="lg" />
          <Skeleton className="h-11 w-24" rounded="lg" />
          <Skeleton className="h-11 w-24" rounded="lg" />
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <div className="space-y-2 rounded-xl border border-border bg-bg-secondary p-4">
          <Skeleton className="h-4 w-36" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </LoadingRegion>
    );
  }

  if (!data) {
    // Only a failed load leaves data null: the dashboard route always
    // answers a payload, including for a user with no broker yet.
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <PageIntro
          title="Live Trader"
          description="Monitor the automated trader as a risk system first and an execution engine second."
          stats={[{ label: "Connection", value: "Unknown", tone: "neutral" }]}
        />
        {accessLost === 401 || accessLost === 403 ? (
          <div role="alert" className="rounded-xl border border-border bg-bg-surface p-8 text-center">
            <h3 className="font-display text-lg font-semibold mb-2">
              {accessLost === 401 ? "Your session ended" : "You no longer have access"}
            </h3>
            <p className="text-sm text-text-secondary max-w-sm mx-auto">
              Trading data was cleared from this screen.{" "}
              {accessLost === 401
                ? "Sign in again to continue."
                : "This page checks again on its own. Ask an administrator if this is unexpected."}
            </p>
            {accessLost === 401 && (
              <Link href="/login" className="mt-4 inline-block text-sm text-accent hover:underline">
                Sign in
              </Link>
            )}
          </div>
        ) : tierRequired ? (
          <>
            <TraderTierRequired />
            <div role="alert" className="rounded-xl border border-border bg-bg-surface p-8 text-center">
              <h3 className="font-display text-lg font-semibold mb-2">Trader plan required</h3>
              <p className="text-sm text-text-secondary max-w-sm mx-auto">
                The trader desk needs an active Trader plan. If you already have one, the plan check
                may have failed; this page checks again on its own, or you can retry now.
              </p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => load()}>
                <RefreshCw className="w-4 h-4" /> Retry
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-border bg-bg-secondary">
            <ErrorState
              headingLevel={2}
              title="Could not load trader data"
              description={`Your positions and engine state could not be read, so nothing is shown rather than something wrong.${dashLoad.error ? ` (${dashLoad.error})` : ""}`}
              onRetry={() => load()}
            />
          </div>
        )}
      </div>
    );
  }

  const { status, todayPnl, lifetimePnl, positions, openOrders = [], trades, signals, pnlHistory, analytics } = data;
  const controls = engineControls(engine, engineMode);
  const nowMs = Date.now();
  const connection = connectionStat(status.connected, dashLoad, nowMs, POLLING_INTERVALS.traderDashboard);
  const resumeMode = resumeModeFor(status, engine?.mode, engineMode);
  // A legacy mode the picker no longer lists (conservative, moderate,
  // aggressive) still has to show as the selected value when it is running.
  const modeOptions = ENGINE_MODES.some((m) => m.value === engineMode)
    ? ENGINE_MODES
    : [...ENGINE_MODES, { value: engineMode, label: engineMode }];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Free-tier paywall banner — auto-hides for trader+ users. Renders
          above the existing UI so free users see the upgrade prompt first,
          then the page content (read-only widgets like risk profile editor
          and watchlist still work fine for free; only engine + broker
          mutations are blocked at the API layer). */}
      <TraderTierRequired />
      <PageIntro
        title="Live Trader"
        description="Monitor the automated trader as a risk system first and an execution engine second."
        stats={[
          { label: "Connection", value: connection.value, tone: connection.tone },
          // Mode dropped 2026-07-15 — it already lives in the picker and the
          // Running badge directly below. Today P&L is what a returning
          // trader actually glances for.
          { label: "Today P&L", value: <SignedValue value={todayPnl?.totalPnl ?? 0} /> },
          { label: "Positions", value: positions.length },
          { label: "Signals", value: signals.length },
        ]}
      />
      {/* A refresh failed: the figures below are the last good payload. */}
      {dashLoad.status === "error" && (
        <div
          role="status"
          className="rounded-xl border border-warning-line bg-warning-fill px-4 py-2 text-sm text-text-secondary flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <span>
            <span className="font-semibold text-warning">
              {dashLoad.lastSuccessAt
                ? `Last updated ${timeAgo(new Date(dashLoad.lastSuccessAt).toISOString())}, refresh failing.`
                : "Refresh failing."}
            </span>{" "}
            Figures below may be out of date. ({dashLoad.error})
          </span>
          <Button variant="ghost" size="sm" onClick={() => load()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry now
          </Button>
        </div>
      )}

      {/* Engine offline but open positions exist — surfaces the silent
          autostart-failed state (e.g., after a container rebuild where
          autoStartIfNeeded burned all 3 retries on a broker hiccup).
          Positions sit with no scans, no syncBrokerStops, no dynamic
          trail updates until the user manually starts the engine. */}
      {engine && engine.running === false && positions.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-warning-line bg-warning-fill px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-warning">
                Engine offline with {positions.length} open position{positions.length === 1 ? "" : "s"}
              </div>
              <div className="text-text-secondary mt-0.5">
                Trailing stops are not being updated while the engine is stopped. Start the engine to resume dynamic stop management.
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={async () => {
              // Resume in the mode it was running, not the picker default.
              const r = await handleEngine("start", resumeMode);
              if (!r.ok) toast({ type: "error", message: `Start failed: ${r.error}` });
            }}
            disabled={cmdLoading !== null}
            loading={cmdLoading === "start"}
          >
            Start engine ({resumeMode})
          </Button>
        </div>
      )}

      {/* Unprotected-position banner — broker rejected the protective stop
          (legacy PDT rejection path; rare post-2026-06-04 but still possible
          on transient broker issues). The position is held WITHOUT a
          broker-side stop; the in-process 1-min poll is its only protection.
          If the container dies for more than a minute, the position is
          fully exposed. */}
      {data?.unprotectedSymbols && data.unprotectedSymbols.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-bearish-line bg-bearish-fill px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="w-5 h-5 text-bearish shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-bearish">
                {data.unprotectedSymbols.length} position{data.unprotectedSymbols.length === 1 ? "" : "s"} without a broker-side stop
              </div>
              <div className="text-text-secondary mt-0.5">
                Broker rejected the protective stop. These are guarded only
                by the in-process 1-min exit poll — consider exiting manually:{" "}
                <span className="font-mono text-text-primary">
                  {data.unprotectedSymbols.join(", ")}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIVE banner — only when engine is actually running against a live broker */}
      {engine?.running && engine?.environment === "live" && (
        <div
          role="alert"
          className="rounded-xl border border-bearish-line bg-bearish-fill px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <div className="flex items-center gap-3">
            <StatusChip tone="bearish" icon={<span className="inline-block h-2 w-2 rounded-full bg-current motion-safe:animate-pulse" />}>
              LIVE
            </StatusChip>
            <div className="text-sm text-text-primary">
              <span className="font-semibold">Real money is at risk.</span>
              <span className="text-text-secondary">
                {" "}
                Engine is placing orders against your live broker account.
              </span>
            </div>
          </div>
          {engine.bootAccountNumber && (
            <div className="text-xs font-mono text-text-muted">
              acct ••••{engine.bootAccountNumber.slice(-4)}
            </div>
          )}
        </div>
      )}

      {/* Engine controls — each user has their own independent engine */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <select
            value={engineMode}
            onChange={(e) => {
              setModeTouched(true);
              setEngineMode(e.target.value);
            }}
            aria-label="Engine mode"
            className="min-h-[44px] min-w-0 flex-1 truncate rounded-lg border border-border-control bg-bg-surface px-3 py-2 text-base text-text-primary sm:flex-none sm:text-sm"
          >
            {modeOptions.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {controls.start && (
            <Button
              onClick={async () => {
                const r = await handleEngine("start");
                if (!r.ok) toast({ type: "error", message: `Start failed: ${r.error}` });
              }}
              disabled={cmdLoading !== null || !status.connected}
              className="min-h-[44px]"
            >
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Start</span>
            </Button>
          )}
          {controls.switchTo && (
            <Button
              onClick={async () => {
                const r = await handleEngine("switch");
                if (!r.ok) toast({ type: "error", message: `Switch failed: ${r.error}` });
              }}
              disabled={cmdLoading !== null}
              className="min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Switch</span>
            </Button>
          )}
          {controls.stop && (
            <Button
              variant="secondary"
              onClick={async () => {
                const r = await handleEngine("stop");
                if (!r.ok) toast({ type: "error", message: `Stop failed: ${r.error}` });
              }}
              disabled={cmdLoading !== null}
              className="min-h-[44px]"
            >
              <Square className="w-4 h-4" />
              <span className="hidden sm:inline">Stop</span>
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => {
              // No typed keyword here on purpose: Halt is THE emergency
              // button — friction defeats its purpose. The modal still shows
              // exactly what's about to be liquidated.
              const posCount = positions?.length ?? 0;
              const mktValue = (positions ?? []).reduce((s, p) => s + p.currentPrice * p.quantity, 0);
              const unreal = (positions ?? []).reduce((s, p) => s + p.unrealizedPnl, 0);
              // Outside regular hours the halt deliberately sells nothing and
              // leaves every broker stop in place (MARKET_CLOSED), so do not
              // promise a liquidation. The server's clock still decides.
              const willLiquidate = posCount > 0 && isMarketOpen();
              requestConfirm({
                title: "Emergency halt",
                description: willLiquidate ? (
                  <>
                    Stops the engine, cancels pending orders, and{" "}
                    <strong className="text-text-primary">liquidates ALL open positions at market</strong>.
                    The engine stays down until you explicitly press Start. This cannot be undone.
                  </>
                ) : posCount > 0 ? (
                  <>
                    Stops the engine and cancels pending buy orders.{" "}
                    <strong className="text-text-primary">The market is closed, so no position will be sold</strong>{" "}
                    and your existing broker stops stay in place. The engine stays down until you explicitly press Start.
                  </>
                ) : (
                  <>
                    Stops the engine and cancels pending orders. The engine stays down until you explicitly press Start.
                  </>
                ),
                summary:
                  posCount > 0
                    ? [
                        { label: "Open positions", value: String(posCount) },
                        {
                          label: "Est. market value",
                          value: `$${mktValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        },
                        {
                          label: "Unrealized P&L",
                          value: formatSignedUsd(unreal),
                          tone: unreal >= 0 ? "bullish" : "bearish",
                        },
                      ]
                    : [{ label: "Open positions", value: "0" }],
                confirmLabel: willLiquidate ? `Halt & liquidate ${posCount}` : "Halt engine",
                onConfirm: async () => {
                  const r = await handleEngine("halt");
                  if (!r.ok) throw new Error(r.error);
                  toast({
                    type: "warning",
                    // Prefer the server's message: it names the account
                    // (paper or live) and the symbols whose liquidation was
                    // actually submitted. The fallback claims nothing about
                    // how many positions were closed.
                    message: r.message ?? "Engine halted. Check your positions for liquidation fills.",
                  });
                },
              });
            }}
            disabled={cmdLoading !== null}
            className="min-h-[44px]"
          >
            <XCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Halt</span>
          </Button>
        </div>
        {engine && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              {engine.running ? (
                <StatusChip tone="bullish" icon={<Play className="h-3 w-3" />}>
                  Running ({engine.mode ?? "swing"})
                </StatusChip>
              ) : engine.halted ? (
                <StatusChip tone="bearish" icon={<XCircle className="h-3 w-3" />}>Halted</StatusChip>
              ) : (
                <StatusChip icon={<Square className="h-3 w-3" />}>Stopped</StatusChip>
              )}
              {engine.environment === "live" && (
                <StatusChip tone="bearish" icon={<AlertTriangle className="h-3 w-3" />}>LIVE, real money</StatusChip>
              )}
              {engine.environment === "paper" && <StatusChip tone="accent">Paper account</StatusChip>}
              {/* Folded in from the removed status bar (2026-07-15) */}
              {todayPnl?.halted && !engine.halted && (
                <StatusChip tone="bearish" icon={<XCircle className="h-3 w-3" />}>Trading halted</StatusChip>
              )}
              {engine.scanCount > 0 && <span className="font-mono">{engine.scanCount} scans</span>}
              {engine.lastScanAt && <span>Last: {timeAgo(engine.lastScanAt)}</span>}
              {!engine.lastScanAt && status.lastHeartbeat && (
                <span>Seen: {timeAgo(status.lastHeartbeat)}</span>
              )}
              {engine.positionCount > 0 && <span className="font-mono">{engine.positionCount} positions</span>}
              {(engine.dailyLoss ?? 0) !== 0 && (
                <span>
                  Day: <SignedValue value={Math.round(engine.dailyLoss ?? 0)} />
                </span>
              )}
              {(engine.consecutiveLosses ?? 0) > 0 && (
                <span className="font-mono text-warning" title="Consecutive losing trades">
                  {engine.consecutiveLosses}L
                </span>
              )}
            </div>
            {/* Adaptive mode: show the effective mode + regime snippet underneath */}
            {engine.mode === "adaptive" && engine.adaptiveRegime && engine.effectiveMode && (
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="font-medium">Adaptive &mdash; currently <span className="text-accent">{engine.effectiveMode}</span></span>
                <span className="text-text-muted">&middot;</span>
                <span className="font-mono">VIX {engine.adaptiveRegime.vix.toFixed(1)}</span>
                <span className="text-text-muted">&middot;</span>
                <span className="font-mono">
                  SPY {(((engine.adaptiveRegime.spyPrice - engine.adaptiveRegime.spyMA50) / engine.adaptiveRegime.spyMA50) * 100 >= 0 ? "+" : "")}
                  {(((engine.adaptiveRegime.spyPrice - engine.adaptiveRegime.spyMA50) / engine.adaptiveRegime.spyMA50) * 100).toFixed(1)}%
                  {" vs SMA50"}
                </span>
                {engine.adaptiveRegime.regime === "risk_on" ? (
                  <StatusChip tone="bullish" icon="▲">risk on</StatusChip>
                ) : engine.adaptiveRegime.regime === "risk_off" ? (
                  <StatusChip tone="bearish" icon="▼">risk off</StatusChip>
                ) : (
                  <StatusChip tone="warning">neutral</StatusChip>
                )}
              </div>
            )}
            {engine.mode === "adaptive" && !engine.adaptiveRegime && engine.running && (
              <div className="text-xs text-text-muted italic">Adaptive &mdash; computing regime on next scan&hellip;</div>
            )}
          </div>
        )}
      </div>

      {/* Status bar removed 2026-07-15 — it was the trader page's third
          display of mode and second of connection. Its unique items
          (heartbeat age, halted pill) now live in the engine badge row
          above; connection lives in PageIntro's stats. One fact, one home. */}

      {/* After-halt bleed surface (post-2026-06-11) — when the engine is
          halted, the only thing standing between the user and further
          losses is whatever broker-side protective stops are still active.
          Surface the open-position bleed (worst-bleeding first) and a
          one-click Flatten All so the user can manually exit without
          digging through Alpaca's UI. */}
      {todayPnl?.halted && positions && positions.length > 0 && (() => {
        const openUnrealized = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
        const losers = positions.filter((p) => p.unrealizedPnl < 0).sort((a, b) => a.unrealizedPnl - b.unrealizedPnl);
        return (
          <Card className="border-bearish-line bg-bearish-fill">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-2">
                <AlertTriangle aria-hidden="true" className="w-5 h-5 text-bearish flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-text-primary">Engine halted with open positions</div>
                  {todayPnl.haltReason && (
                    <div className="text-xs text-text-secondary mt-0.5 font-mono">{todayPnl.haltReason}</div>
                  )}
                  <div className="text-xs text-text-muted mt-1">
                    {/* Two different halts share this card (2026-07-15 copy fix):
                        a user emergency halt LIQUIDATES everything (positions
                        here mean fills are pending or sells were rejected);
                        safeguard auto-halts (daily loss, equity collapse,
                        consecutive losses) block new BUYs but deliberately do
                        NOT flatten. Branch so the copy never lies about which
                        one happened. */}
                    {todayPnl.haltReason?.includes("user_emergency_halt") || todayPnl.haltReason?.includes("flatten")
                      ? "Your emergency halt submitted market sells for every position. Anything still listed below is awaiting fills — or its sell was rejected. Re-flatten if these rows persist."
                      : "This safeguard halt blocks new BUYs but does NOT flatten. Existing broker stops still fire — but mark-to-market keeps moving. Review or flatten manually below."}
                  </div>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                loading={cmdLoading === "flatten_all_from_halt"}
                onClick={() => {
                  const count = positions.length;
                  requestConfirm({
                    title: "Flatten all positions",
                    description: (
                      <>
                        Market-sells <strong className="text-text-primary">every open position</strong> right
                        now, at whatever the market pays. Broker stops on these symbols are cancelled as the
                        sells fill. This cannot be undone.
                      </>
                    ),
                    summary: [
                      { label: "Positions to sell", value: String(count) },
                      {
                        label: "Est. market value",
                        value: `$${positions
                          .reduce((s, p) => s + p.currentPrice * p.quantity, 0)
                          .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      },
                      {
                        label: "Unrealized P&L",
                        value: formatSignedUsd(openUnrealized),
                        tone: openUnrealized >= 0 ? "bullish" : "bearish",
                      },
                    ],
                    // The one action that liquidates the whole book gets the
                    // typed-keyword gate — unlike Halt, this is reached from a
                    // reflective state (reviewing the bleed list), not a panic.
                    typedKeyword: "FLATTEN",
                    confirmLabel: `Flatten ${count} position${count === 1 ? "" : "s"}`,
                    onConfirm: async () => {
                      setCmdLoading("flatten_all_from_halt");
                      const result = await sendCommand("flatten");
                      setCmdLoading(null);
                      if (result.error) throw new Error(result.error);
                      toast({
                        type: "success",
                        message: result.queuedForOpen && result.message
                          ? result.message
                          : `${count} sell order${count === 1 ? "" : "s"} submitted — watching fills.`,
                      });
                      // Refresh through load(): fenced, and it marks a failure.
                      await load();
                    },
                  });
                }}
              >
                Flatten All
              </Button>
            </div>
            <dl className="grid grid-cols-1 gap-3 mb-3 sm:grid-cols-3">
              <div>
                <dt className="eyebrow text-text-muted">Open positions</dt>
                <dd className="font-mono text-lg font-semibold text-text-primary">{positions.length}</dd>
              </div>
              <div>
                <dt className="eyebrow text-text-muted">Unrealized P&L</dt>
                <dd className="text-lg font-semibold"><SignedValue value={openUnrealized} /></dd>
              </div>
              <div>
                <dt className="eyebrow text-text-muted">Realized today</dt>
                <dd className="text-lg font-semibold"><SignedValue value={todayPnl.realizedPnl} /></dd>
              </div>
            </dl>
            {losers.length > 0 && (
              <div className="border-t border-[var(--color-hairline-inner)] pt-3">
                <div className="eyebrow text-text-muted mb-2">Worst bleeding ({Math.min(losers.length, 5)} of {losers.length})</div>
                <div className="space-y-1.5">
                  {losers.slice(0, 5).map((p) => {
                    const movePct = p.entryPrice > 0 ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100 : 0;
                    return (
                      <div key={p.symbol} className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-medium text-text-primary truncate">{p.symbol}</span>
                          <span className="text-xs text-text-muted">{p.quantity} sh @ ${p.entryPrice.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-xs">
                          <span className="text-bearish">{movePct.toFixed(2).replace("-", "\u2212")}%</span>
                          <SignedValue value={p.unrealizedPnl} glyph={false} className="min-w-[80px] justify-end" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        );
      })()}

      {/* Account balance */}
      {data?.brokerAccount && <AccountReadout account={data.brokerAccount} />}

      {/* P&L (lifetime realized + current unrealized). Account equity is the
          basis for a percent ("X% of account"); without it, dollars only. */}
      {(lifetimePnl || todayPnl) && (
        <PnlReadout
          todayPnl={todayPnl}
          lifetimePnl={lifetimePnl}
          basis={(data.brokerAccount?.equity ?? 0) > 0 ? (data.brokerAccount?.equity as number) : undefined}
          pnlFormat={pnlFormat}
        />
      )}

      {/* Performance Analytics */}
      {analytics && analytics.totalTrades > 0 && <PerformanceAnalytics analytics={analytics} />}

      {/* Tax election (§475(f) MTM) + wash-sale protection status.
          Moved below the money/analytics fold 2026-07-15 — it's a
          set-and-forget setting that was pushing the engine controls and
          equity readout below the fold on the most-visited screen. */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-text-primary">Tax election</div>
            <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={taxStatus?.hasTraderTaxStatus === true}
                onChange={(e) => toggleMtm(e.target.checked)}
                disabled={mtmSaving || !hasLoaded(taxLoad)}
                aria-busy={taxLoad.status === "loading" || mtmSaving}
                className="h-4 w-4 rounded border-border accent-accent cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-sm text-text-secondary">
                I have elected <span className="font-medium text-text-primary">§475(f) Mark-to-Market</span>
                {taxStatus?.mtmElectionYear && (
                  <span className="text-text-muted"> ({taxStatus.mtmElectionYear})</span>
                )}
              </span>
            </label>
            {taxLoad.status === "error" && !hasLoaded(taxLoad) && (
              <div role="alert" className="mt-1 flex items-center gap-2 text-xs text-bearish">
                <span>{taxLoad.error}</span>
                <Button variant="ghost" size="sm" onClick={() => loadTaxStatus()}>
                  Retry
                </Button>
              </div>
            )}
            <div className="text-xs text-text-muted mt-1">
              Self-attested. MTM traders are exempt from §1091 wash-sale rule. Election deadline was Apr 15 of the prior tax year — Beacontry does not file or validate.
            </div>
          </div>
          <div className="sm:border-l sm:border-border sm:pl-4 sm:min-w-[200px]">
            <div className="eyebrow text-text-muted">Wash-sale protection</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`inline-block w-2 h-2 rounded-full ${
                  engine?.washSaleProtectionEnabled ? "bg-bullish" : "bg-text-muted"
                }`}
              />
              <span className="text-sm font-medium">
                {engine?.washSaleProtectionEnabled ? "On" : "Off"}
              </span>
              {(engine?.washSaleBlockedCount ?? 0) > 0 && (
                <span className="text-xs font-mono text-text-muted">
                  {engine?.washSaleBlockedCount} symbol{(engine?.washSaleBlockedCount ?? 0) === 1 ? "" : "s"} blocked
                </span>
              )}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {engine?.washSaleProtectionEnabled
                ? "Re-entries blocked for 31 days after any losing close."
                : "MTM elected — wash sale rule does not apply."}
            </div>
          </div>
        </div>
      </Card>

      {/* Tax-aware trading callouts */}
      <TraderTaxCallouts />

      {/* Open positions */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle>Open Positions ({positions.length})</CardTitle>
        </CardHeader>
        <PositionsTable
          positions={positions}
          pnlFormat={pnlFormat}
          busy={cmdLoading !== null}
          onOpen={setDetailSymbol}
          onClose={confirmClosePosition}
        />
      </Card>

      {/* Open Orders — always renders so the 2xl:grid-cols-2 right slot
          stays filled. Empty state explains where the actual stops live
          (broker-side GTC) instead of leaving a blank rectangle. */}
      {openOrders.length === 0 ? (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Open Orders (0)</CardTitle>
          </CardHeader>
          <div className="py-6 text-center">
            <p className="text-sm text-text-muted">No resting orders</p>
            <p className="mt-2 text-xs text-text-muted max-w-xs mx-auto leading-relaxed">
              Stop-loss + trailing-stop levels live on the broker as GTC orders.
              See the <strong className="text-text-secondary">Stop</strong> column
              in Open Positions for the current ratcheted level per symbol.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Open Orders ({openOrders.length})</CardTitle>
          </CardHeader>
          <OpenOrdersTable orders={openOrders} />
        </Card>
      )}
      </div>{/* end 2xl:grid-cols-2 positions+orders wrap */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent signals */}
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Recent Signals</CardTitle>
          </CardHeader>
          <RecentSignals signals={signals} />
        </Card>

        {/* Recent trades */}
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          <RecentTrades
            trades={trades}
            pnlFormat={pnlFormat}
            summarizing={summarizing}
            summaries={summaryByTradeId}
            onSummarize={summarizeTrade}
          />
        </Card>
      </div>

      {/* Risk Settings — optional overrides (empty = engine decides) */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              <CardTitle>Risk Overrides</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRiskPersisted(!showRisk)}
            >
              <Settings className="w-4 h-4 text-text-muted" />
            </Button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Only set fields you want to override. Empty fields use engine defaults.
          </p>
        </CardHeader>
        {showRisk && riskLoad.status === "error" && !hasLoaded(riskLoad) && (
          <div role="alert" className="mb-3 flex items-center gap-3 text-sm text-bearish">
            <span>{riskLoad.error} Saving is off until they load, so nothing is overwritten.</span>
            <Button variant="secondary" size="sm" onClick={() => loadRiskProfile()}>
              Retry
            </Button>
          </div>
        )}
        {showRisk && (
          <div className="space-y-4" aria-busy={riskLoad.status === "loading"}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                {
                  key: "accountSize",
                  label: "Account Size ($)",
                  placeholder: "Engine default: 10,000",
                  step: "100",
                  help: "Your starting capital. Drives position sizing — a $5K account with 10% max position takes $500 trades.",
                },
                {
                  key: "maxDailyLossPct",
                  label: "Max Daily Loss (%)",
                  placeholder: "Engine default: 2%",
                  step: "0.1",
                  help: "Engine halts for the day if losses exceed this. 1–2% is conservative; >3% is aggressive.",
                },
                {
                  key: "maxDrawdownPct",
                  label: "Max Drawdown (%)",
                  placeholder: "Engine default: 10%",
                  step: "0.5",
                  help: "How much your account can drop from peak before exposure rules kick in. Higher = tolerates bigger swings.",
                },
                {
                  key: "maxPositionPct",
                  label: "Max Position (%)",
                  placeholder: "Engine default: 15%",
                  step: "0.5",
                  help: "Largest single trade as % of equity. 10–15% = diversified; 25%+ = concentrated. Live trading: keep ≤10%.",
                },
                {
                  key: "maxPositionSize",
                  label: "Max Position Size (shares)",
                  placeholder: "Engine default: 100",
                  step: "1",
                  help: "Hard cap on shares per order. Prevents oversized fills on cheap stocks (e.g. a $1 stock with 10% position = 1000 shares without this).",
                },
                {
                  key: "maxSingleTradeLoss",
                  label: "Max Single Trade Loss ($)",
                  placeholder: "Engine default: 100",
                  step: "10",
                  help: "Informational only — the engine sizes by % but you can use this as a sanity ceiling.",
                },
                {
                  key: "maxExposureMultiplier",
                  label: "Max Exposure (× equity)",
                  placeholder: "Engine default: 1.5×",
                  step: "0.1",
                  help: "Sum of all open positions as a multiple of equity. 1.0× = no leverage, 1.5× = mild margin use. Stay ≤1.0× on a cash account.",
                },
                {
                  key: "trailActivationProfitPct",
                  label: "Trail activation (peak % above entry)",
                  placeholder: "Off (recommended: 5)",
                  step: "0.5",
                  help: "Trailing stop stays dormant until peak rises this far above entry. Fixed disaster stop still active from day 0. Robustness sweep recommends 5%: positive Δreturn on the loser universe in 4/5 periods, on random S&P in 5/5. Leave blank to keep the trail always-active.",
                },
                {
                  key: "trailActivationBars",
                  label: "Trail activation (delay, days)",
                  placeholder: "Off (skip unless tuning)",
                  step: "1",
                  help: "Trailing stop stays dormant for this many trading days after entry. Less robust than the profit gate per the sweep — surfaced for opt-in tuning only. Leave blank or 0 for default.",
                },
                {
                  key: "maxSectorExposurePct",
                  label: "Max sector exposure (% of equity)",
                  placeholder: "Off (e.g. 30)",
                  step: "1",
                  help: "Blocks a BUY that would push any one sector (Technology, Financials, ...) above this % of equity, capping single-sector concentration. Leave blank to disable.",
                },
                {
                  key: "earningsBlackoutDays",
                  label: "Earnings blackout (days)",
                  placeholder: "Off (e.g. 5)",
                  step: "1",
                  help: "Blocks new BUYs within this many calendar days of a symbol's earnings release, avoiding event-risk gaps. Leave blank or 0 to disable.",
                },
              ] as const).map(({ key, label, placeholder, step, help }) => (
                <div key={key}>
                  <Input
                    label={label}
                    help={help}
                    type="number"
                    step={step}
                    min="0"
                    value={riskForm[key]}
                    placeholder={placeholder}
                    onChange={(e) => setRiskForm({ ...riskForm, [key]: e.target.value })}
                    disabled={!hasLoaded(riskLoad) || riskSaving}
                    className="font-mono"
                  />
                  {riskForm[key] === "" && hasLoaded(riskLoad) && (
                    <span className="text-xs text-text-muted mt-0.5 block">Engine decides</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                loading={riskSaving}
                onClick={async () => {
                  if (!hasLoaded(riskLoad)) return;
                  setRiskSaving(true);
                  setRiskSaved(false);
                  setRiskSaveError(null);
                  try {
                    // Only the fields changed from the loaded snapshot. A
                    // field the user never touched is not sent, so the route
                    // leaves it as stored.
                    const payload = diffRiskProfile(riskLoaded, riskForm);
                    const res = await fetch("/api/risk-profile", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    if (!res.ok) {
                      const body = await res.json().catch(() => null);
                      const msg = typeof body?.error === "string" ? body.error : `request failed (${res.status})`;
                      setRiskSaveError(`Not saved: ${msg}. Your stored overrides are unchanged.`);
                      return;
                    }
                    const saved = await res.json().catch(() => null);
                    const form = saved && "profile" in saved ? profileToRiskForm(saved.profile) : riskForm;
                    setRiskForm(form);
                    setRiskLoaded(form);

                    // Push the overrides that are set to the live engine.
                    const engineParams = riskFormToEngineParams(form);
                    if (Object.keys(engineParams).length > 0) {
                      const result = await sendCommand("risk", { params: engineParams });
                      if (result.error) {
                        setRiskSaveError(
                          `Saved to your profile, but the engine did not take it: ${result.error}. It applies on the next engine start.`,
                        );
                        return;
                      }
                    }

                    setRiskSaved(true);
                    setTimeout(() => setRiskSaved(false), 3000);
                  } catch {
                    setRiskSaveError("Save failed with a network error. Reload to see what is stored.");
                  } finally {
                    setRiskSaving(false);
                  }
                }}
                disabled={
                  cmdLoading !== null ||
                  !hasLoaded(riskLoad) ||
                  Object.keys(diffRiskProfile(riskLoaded, riskForm)).length === 0
                }
              >
                Save Overrides
              </Button>
              {riskSaved && (
                <span className="flex items-center gap-1 text-sm text-bullish animate-fade-in">
                  <Check className="w-4 h-4" /> Saved
                </span>
              )}
              {riskSaveError && (
                <span role="alert" className="text-sm text-bearish">
                  {riskSaveError}
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      <PositionDetailSheet
        symbol={detailSymbol}
        position={
          detailSymbol
            ? positions.find((p) => p.symbol === detailSymbol) ?? null
            : null
        }
        signals={signals}
        engineRunning={engine?.running === true}
        onClose={() => setDetailSymbol(null)}
        onClosePosition={(sym) => {
          const pos = positions.find((p) => p.symbol === sym);
          requestConfirm({
            title: `Close ${sym}`,
            description: <>Market-sells the full position. Its broker stop is cancelled as the sell fills.</>,
            summary: pos
              ? [
                  { label: "Shares", value: String(pos.quantity ?? 0) },
                  { label: "Current price", value: `$${(pos.currentPrice ?? 0).toFixed(2)}` },
                  {
                    label: "Unrealized P&L",
                    value: formatSignedUsd(pos.unrealizedPnl ?? 0),
                    tone: (pos.unrealizedPnl ?? 0) >= 0 ? "bullish" : "bearish",
                  },
                ]
              : undefined,
            confirmLabel: `Sell all ${sym}`,
            onConfirm: async () => {
              setCmdLoading("flatten");
              const result = await sendCommand("flatten", { symbol: sym });
              setCmdLoading(null);
              if (result.error) throw new Error(result.error);
              toast({ type: "success", message: result.queuedForOpen && result.message ? result.message : `Sell order for ${sym} submitted.` });
              // Refresh through load(): fenced, and it marks a failure.
              await load();
            },
          });
        }}
      />

      {confirmDialog}
    </div>
  );
}
