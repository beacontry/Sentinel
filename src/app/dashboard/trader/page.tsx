"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Clock, RefreshCw } from "lucide-react";
import { usePolling } from "@/hooks/usePolling";
import { useRecoveryPoll } from "@/hooks/useRecoveryPoll";
import { accessRegained } from "@/lib/recovery-poll";
import { POLLING_INTERVALS } from "@/lib/config";
import { isMarketOpen } from "@/lib/market-hours";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/toast";
import { useConfirmAction } from "@/components/ui/confirm-action-modal";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { PositionDetailSheet } from "@/components/dashboard/position-detail-sheet";
import { Button } from "@/components/ui/button";
import { TraderTierRequired } from "@/components/tiers/trader-tier-required";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  timeAgo,
  type EngineStatus,
  type TaxStatus,
  type TraderData,
  type TraderPosition,
} from "@/components/trader/types";
import { PositionsTable } from "@/components/trader/positions-table";
import { OpenOrdersTable } from "@/components/trader/open-orders-table";
import { RecentSignals, RecentTrades } from "@/components/trader/recent-activity";
import { DeskReadout, PerformanceAnalytics } from "@/components/trader/account-readout";
import { TraderTaxCallouts } from "@/components/trader/tax-callouts";
import { DeskPanel } from "@/components/trader/desk-panel";
import { DeskAlert } from "@/components/trader/desk-alert";
import { DeskHeader, DeskSkeleton } from "@/components/trader/desk-frame";
import { EngineControls } from "@/components/trader/engine-controls";
import { EnvironmentStrip } from "@/components/trader/environment-strip";
import { HaltPanel } from "@/components/trader/halt-panel";
import { RiskOverridesPanel } from "@/components/trader/risk-override-form";
import { TaxElectionPanel } from "@/components/trader/tax-status-toggle";
import { RefreshFailingNotice, TraderFreshness } from "@/components/trader/trader-freshness";
import { useActiveBroker } from "@/components/trader/use-active-broker";
import {
  closeFromSheetConfirm,
  closePositionConfirm,
  flattenAllConfirm,
  haltConfirm,
} from "@/components/trader/confirmations";
import {
  accessLossStatus,
  applyEngineResponse,
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

export default function TraderPage() {
  const { pnlFormat } = useDisplayPrefs();
  const { toast } = useToast();
  const { requestConfirm, dialog: confirmDialog } = useConfirmAction();
  // The active broker connection, for the environment strip. A switch in
  // the top bar reloads the desk too, so the strip and the figures under
  // it never describe two different accounts for a whole poll interval.
  const { broker, reload: reloadBroker } = useActiveBroker(() => {
    void load();
  });
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
  /** Market-sells one symbol, then refreshes through load(), which is fenced and marks a failure. */
  async function flattenSymbol(symbol: string) {
    setCmdLoading("flatten");
    const result = await sendCommand("flatten", { symbol });
    setCmdLoading(null);
    if (result.error) throw new Error(result.error);
    toast({
      type: "success",
      message: result.queuedForOpen && result.message ? result.message : `Sell order for ${symbol} submitted.`,
    });
    await load();
  }

  function confirmClosePosition(p: TraderPosition) {
    requestConfirm(closePositionConfirm(p, () => flattenSymbol(p.symbol)));
  }

  if (loading) return <DeskSkeleton />;

  if (!data) {
    // Only a failed load leaves data null: the dashboard route always
    // answers a payload, including for a user with no broker yet.
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        {accessLost === null && <EnvironmentStrip broker={broker} onRetry={reloadBroker} />}
        <DeskHeader />
        {accessLost === 401 || accessLost === 403 ? (
          <div role="alert" className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
            <h2 className="mb-2 text-lg font-semibold">
              {accessLost === 401 ? "Your session ended" : "You no longer have access"}
            </h2>
            <p className="mx-auto max-w-sm text-sm text-text-secondary">
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
            <div role="alert" className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
              <h2 className="mb-2 text-lg font-semibold">Trader plan required</h2>
              <p className="mx-auto max-w-sm text-sm text-text-secondary">
                The trader desk needs an active Trader plan. If you already have one, the plan check
                may have failed; this page checks again on its own, or you can retry now.
              </p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => load()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
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

  const { status, todayPnl, lifetimePnl, positions, openOrders = [], trades, signals, analytics } = data;
  const controls = engineControls(engine, engineMode);
  const resumeMode = resumeModeFor(status, engine?.mode, engineMode);
  // No active connection: the account figures and the book have nothing to
  // show, so one not-connected state stands in for them. A running engine
  // keeps its panel whatever the connection says, so Halt stays reachable.
  const notConnected = broker.status === "none";
  const showEngine = !notConnected || engine?.running === true;

  async function startEngine(mode?: string) {
    const r = await handleEngine("start", mode);
    if (!r.ok) toast({ type: "error", message: `Start failed: ${r.error}` });
  }

  function confirmHalt() {
    requestConfirm(
      haltConfirm(positions ?? [], isMarketOpen(), async () => {
        const r = await handleEngine("halt");
        if (!r.ok) throw new Error(r.error);
        toast({
          type: "warning",
          // Prefer the server's message: it names the account (paper or
          // live) and the symbols whose liquidation was actually submitted.
          // The fallback claims nothing about how many positions closed.
          message: r.message ?? "Engine halted. Check your positions for liquidation fills.",
        });
      }),
    );
  }

  function confirmFlattenAll() {
    const count = positions.length;
    requestConfirm(
      flattenAllConfirm(positions, async () => {
        setCmdLoading("flatten_all_from_halt");
        const result = await sendCommand("flatten");
        setCmdLoading(null);
        if (result.error) throw new Error(result.error);
        toast({
          type: "success",
          message:
            result.queuedForOpen && result.message
              ? result.message
              : `${count} sell order${count === 1 ? "" : "s"} submitted, watching fills.`,
        });
        // Refresh through load(): fenced, and it marks a failure.
        await load();
      }),
    );
  }

  async function saveRiskOverrides() {
    if (!hasLoaded(riskLoad)) return;
    setRiskSaving(true);
    setRiskSaved(false);
    setRiskSaveError(null);
    try {
      // Only the fields changed from the loaded snapshot. A field the user
      // never touched is not sent, so the route leaves it as stored.
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
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      {/* Free-tier paywall banner; hides itself for trader+ users. Read-only
          widgets still work for free; engine and broker mutations are
          blocked at the API layer. */}
      <TraderTierRequired />

      <EnvironmentStrip
        broker={broker}
        engineLive={
          engine?.running && engine.environment === "live"
            ? { accountTail: engine.bootAccountNumber ? engine.bootAccountNumber.slice(-4) : null }
            : null
        }
        onRetry={reloadBroker}
      />

      {/* With no broker there is no live data to date; the strip above says why. */}
      <DeskHeader>
        {!notConnected && (
          <TraderFreshness
            load={dashLoad}
            connected={status.connected}
            intervalMs={POLLING_INTERVALS.traderDashboard}
          />
        )}
      </DeskHeader>
      <RefreshFailingNotice load={dashLoad} onRetry={() => load()} />

      {/* A position the broker would not protect is the most urgent thing
          on the page: it is guarded only by the in-process 1-min exit poll,
          and fully exposed if the container is down for more than that. */}
      {data.unprotectedSymbols && data.unprotectedSymbols.length > 0 && (
        <DeskAlert
          tone="bearish"
          title={`${data.unprotectedSymbols.length} position${data.unprotectedSymbols.length === 1 ? "" : "s"} without a broker-side stop`}
        >
          The broker rejected the protective stop. These are guarded only by the in-process 1-minute exit poll;
          consider exiting manually:{" "}
          <span className="font-mono text-text-primary">{data.unprotectedSymbols.join(", ")}</span>
        </DeskAlert>
      )}

      {/* After a halt, with positions still open: the bleed and Flatten all. */}
      {todayPnl?.halted && positions.length > 0 && (
        <HaltPanel
          todayPnl={todayPnl}
          positions={positions}
          flattening={cmdLoading === "flatten_all_from_halt"}
          onFlattenAll={confirmFlattenAll}
        />
      )}

      {/* Engine offline with open positions: the silent autostart-failed
          state (e.g. a rebuild where autoStartIfNeeded spent its retries on
          a broker hiccup). Nothing ratchets the stops until it starts. */}
      {engine && engine.running === false && positions.length > 0 && (
        <DeskAlert
          tone="warning"
          title={`Engine offline with ${positions.length} open position${positions.length === 1 ? "" : "s"}`}
          action={
            <Button
              size="sm"
              // Resume in the mode it was running, not the picker default.
              onClick={() => startEngine(resumeMode)}
              disabled={cmdLoading !== null}
              loading={cmdLoading === "start"}
              className="w-full sm:w-auto"
            >
              Start engine ({resumeMode})
            </Button>
          }
        >
          Trailing stops are not being updated while the engine is stopped. Start it to resume dynamic stop
          management.
        </DeskAlert>
      )}

      {showEngine && (
        <EngineControls
          engine={engine}
          pickerMode={engineMode}
          onPickMode={(mode) => {
            setModeTouched(true);
            setEngineMode(mode);
          }}
          controls={controls}
          pending={cmdLoading}
          canStart={status.connected}
          lastHeartbeat={status.lastHeartbeat}
          tradingHalted={todayPnl?.halted === true && engine?.halted !== true}
          onStart={() => startEngine()}
          onSwitch={async () => {
            const r = await handleEngine("switch");
            if (!r.ok) toast({ type: "error", message: `Switch failed: ${r.error}` });
          }}
          onStop={async () => {
            const r = await handleEngine("stop");
            if (!r.ok) toast({ type: "error", message: `Stop failed: ${r.error}` });
          }}
          onHalt={confirmHalt}
        />
      )}

      {notConnected ? (
        <section aria-label="Broker connection" className="rounded-xl border border-border bg-bg-secondary">
          <EmptyState
            kind="not-connected"
            headingLevel={2}
            title="Connect a broker to trade"
            description="Balances, positions and orders come from your broker. Connect a paper account to try the engine without real money."
          />
        </section>
      ) : (
        <DeskReadout account={data.brokerAccount} todayPnl={todayPnl} lifetimePnl={lifetimePnl} pnlFormat={pnlFormat} />
      )}

      <div className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4 lg:space-y-6">
          {!notConnected && (
            <DeskPanel
              id="trader-positions"
              title="Open positions"
              count={positions.length}
              description="Held at the broker. Select a symbol for its detail."
              controls={
                data.positionsStale ? (
                  <StatusChip tone="warning" icon={<Clock className="h-3 w-3" />}>
                    Cached {timeAgo(new Date(Date.now() - (data.positionsAgeSeconds ?? 0) * 1000).toISOString())}
                  </StatusChip>
                ) : undefined
              }
            >
              <PositionsTable
                positions={positions}
                pnlFormat={pnlFormat}
                busy={cmdLoading !== null}
                onOpen={setDetailSymbol}
                onClose={confirmClosePosition}
              />
            </DeskPanel>
          )}

          {!notConnected && (
            <DeskPanel
              id="trader-orders"
              title="Open orders"
              count={openOrders.length}
              description="Resting at the broker, protective stops included."
            >
              {openOrders.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-text-secondary">No resting orders</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-text-muted">
                    Stop-loss and trailing-stop levels live on the broker as GTC orders. The Stop column in Open
                    positions shows the current level per symbol.
                  </p>
                </div>
              ) : (
                <OpenOrdersTable orders={openOrders} />
              )}
            </DeskPanel>
          )}

          <DeskPanel id="trader-trades" title="Recent trades" count={trades.length} description="Orders the engine placed, newest first.">
            <RecentTrades
              trades={trades}
              pnlFormat={pnlFormat}
              summarizing={summarizing}
              summaries={summaryByTradeId}
              onSummarize={summarizeTrade}
            />
          </DeskPanel>
        </div>

        {/* The side column stretches to the main one's height and Recent
            signals takes up the difference, so no empty strip is left
            under the column. */}
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <DeskPanel
            id="trader-signals"
            title="Recent signals"
            count={signals.length}
            description="What the last scans found."
            className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"
          >
            <RecentSignals signals={signals} fill />
          </DeskPanel>

          {analytics && analytics.totalTrades > 0 && <PerformanceAnalytics analytics={analytics} />}

          <TaxElectionPanel
            taxStatus={taxStatus}
            load={taxLoad}
            saving={mtmSaving}
            onToggle={toggleMtm}
            onRetry={() => loadTaxStatus()}
            washSaleOn={engine ? engine.washSaleProtectionEnabled === true : undefined}
            washSaleBlockedCount={engine?.washSaleBlockedCount ?? 0}
          />

          <TraderTaxCallouts />
        </div>
      </div>

      <RiskOverridesPanel
        open={showRisk}
        onToggleOpen={() => setShowRiskPersisted(!showRisk)}
        form={riskForm}
        onField={(key, value) => setRiskForm({ ...riskForm, [key]: value })}
        load={riskLoad}
        onRetry={() => loadRiskProfile()}
        saving={riskSaving}
        saved={riskSaved}
        saveError={riskSaveError}
        canSave={
          cmdLoading === null && hasLoaded(riskLoad) && Object.keys(diffRiskProfile(riskLoaded, riskForm)).length > 0
        }
        onSave={saveRiskOverrides}
      />

      <PositionDetailSheet
        symbol={detailSymbol}
        position={detailSymbol ? positions.find((p) => p.symbol === detailSymbol) ?? null : null}
        signals={signals}
        engineRunning={engine?.running === true}
        onClose={() => setDetailSymbol(null)}
        onClosePosition={(sym) =>
          requestConfirm(
            closeFromSheetConfirm(sym, positions.find((p) => p.symbol === sym), () => flattenSymbol(sym)),
          )
        }
      />

      {confirmDialog}
    </div>
  );
}
