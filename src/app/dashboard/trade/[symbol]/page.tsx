"use client";

// Manual order ticket. Disabled when the engine is running because:
// (a) concurrent manual + engine orders create position-map drift —
//     engine's in-memory size lags the broker by up to one scan interval;
// (b) the engine may place a conflicting protective stop sized for the
//     position before the manual fill. Easier to require human exclusivity.
//
// Supports share-count and dollar-based (notional) orders. Notional path
// is constrained by Alpaca to market + day/ioc TIF — the validator enforces.
// Bracket orders are share-count only (notional + bracket not supported).

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { SmartBackButton } from "@/components/ui/smart-back-button";
import { orderIntentFor, orderIntentAfterResponse, type OrderIntent } from "@/lib/order-intent";
import { BROKER_CHANGED_EVENT } from "@/lib/broker-events";
import {
  AlertCircle,
  DollarSign,
  Hash,
  ShieldAlert,
  Briefcase,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Inset } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip } from "@/components/ui/status-chip";
import { Toggle } from "@/components/ui/toggle";
import { formatSignedPercent } from "@/lib/format-pnl";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirmAction } from "@/components/ui/confirm-action-modal";
import { ticketEngineState } from "@/lib/trader-view";
import { fetchQuotes } from "@/lib/quotes-client";

interface EngineStatus {
  running: boolean;
  environment: "paper" | "live" | null;
}

interface AccountInfo {
  equity: number;
  buyingPower: number;
  cash: number;
  currency: string;
}

interface ConnectionMeta {
  id: string;
  broker: string;
  label: string;
  environment: "paper" | "live";
  isActive: boolean;
}

interface QuoteSnapshot {
  price: number;
  changePct: number | undefined;
}

// The active connection from a /api/broker/connections response, or null.
function activeConnectionFrom(d: { connections?: ConnectionMeta[] }): ConnectionMeta | null {
  return (d.connections ?? []).find((c) => c.isActive) ?? null;
}

type OrderType = "market" | "limit" | "stop" | "stop_limit";
type TimeInForce = "day" | "gtc" | "ioc" | "fok";
type SizingMode = "shares" | "dollars";

export default function TradePage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: rawSymbol } = use(params);
  const symbol = rawSymbol.toUpperCase();
  const toast = useToast();
  const { requestConfirm, dialog: confirmDialog } = useConfirmAction();

  // Engine + account context
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [connection, setConnection] = useState<ConnectionMeta | null>(null);
  const [quote, setQuote] = useState<QuoteSnapshot | null>(null);
  // True once a quote read failed: the header says "Price unavailable" and
  // the cost estimate for market and stop orders says so too, instead of
  // leaving a blank that reads as "not loaded yet".
  const [quoteUnavailable, setQuoteUnavailable] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);

  // Form state
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [sizingMode, setSizingMode] = useState<SizingMode>("shares");
  const [qty, setQty] = useState("");
  const [notional, setNotional] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [tif, setTif] = useState<TimeInForce>("day");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [useBracket, setUseBracket] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ─── Boot context ────────────────────────────────────────────────
  // Loaded on mount and again whenever the active broker connection changes
  // (the sidebar switcher's broker-changed event, a pre-submit re-read that
  // finds a different account, or the route's 409 CONNECTION_CHANGED). The
  // generation counter drops a load that a newer one or an unmount superseded.
  const contextGenRef = useRef(0);
  const loadContext = useCallback(async () => {
    const gen = ++contextGenRef.current;
    let engineRead = false;
    try {
      // The quote comes from the read-only /api/quotes. fetchQuotes never
      // rejects: a failed read is a null quote, not a failed context load.
      const [engineRes, accountRes, connectionsRes, quotes] = await Promise.all([
        fetch("/api/trader/engine"),
        fetch("/api/broker/account"),
        fetch("/api/broker/connections"),
        fetchQuotes([symbol]),
      ]);
      if (gen !== contextGenRef.current) return;
      if (engineRes.ok) {
        const d = await engineRes.json();
        setEngineStatus({
          running: d.data?.running === true,
          environment: d.data?.environment ?? null,
        });
        engineRead = true;
      } else {
        // Unknown, not stopped: the ticket must not claim the engine is
        // stopped when its status could not be read.
        setEngineStatus(null);
      }
      if (accountRes.ok) {
        const d = await accountRes.json();
        // /api/broker/account returns { account: {...}, positions: [...] }
        if (d.account) {
          setAccount({
            equity: d.account.equity,
            buyingPower: d.account.buyingPower,
            cash: d.account.cash,
            currency: d.account.currency ?? "USD",
          });
        }
      }
      if (connectionsRes.ok) {
        setConnection(activeConnectionFrom(await connectionsRes.json()));
      }
      const q = quotes[symbol];
      if (q) {
        setQuote({ price: q.price, changePct: q.change });
        setQuoteUnavailable(false);
      } else {
        // Drop any earlier price so the estimate never uses a stale one.
        setQuote(null);
        setQuoteUnavailable(true);
      }
    } catch {
      // Fields can still be filled in manually, but a failed read leaves the
      // engine state unknown rather than the last (or a default) value.
      if (gen === contextGenRef.current && !engineRead) setEngineStatus(null);
    } finally {
      if (gen === contextGenRef.current) setLoadingContext(false);
    }
  }, [symbol]);

  useEffect(() => {
    void loadContext();
    return () => {
      // Invalidate any load still in flight.
      contextGenRef.current++;
    };
  }, [loadContext]);

  // Idempotency key for the order intent on the ticket. Minted on the first
  // submit, reused on every resubmit of the same order so the broker refuses
  // a duplicate, and replaced only after a success or when the order changes.
  const orderIntentRef = useRef<OrderIntent | null>(null);

  // Clear everything sized for the previous account and drop its order
  // intent. Side, order type and TIF are kept.
  const resetTicket = useCallback(() => {
    setQty("");
    setNotional("");
    setLimitPrice("");
    setStopPrice("");
    setUseBracket(false);
    setTakeProfitPrice("");
    setStopLossPrice("");
    orderIntentRef.current = null;
  }, []);

  // Another account became active (this tab's sidebar, or another tab or
  // device as seen by the sidebar's poll): drop this account's context and
  // form and load the new one, so the LIVE banner and confirm follow it.
  const reloadForNewConnection = useCallback(() => {
    resetTicket();
    setConnection(null);
    setAccount(null);
    setLoadingContext(true);
    void loadContext();
  }, [resetTicket, loadContext]);

  useEffect(() => {
    function onBrokerChanged() {
      reloadForNewConnection();
      toast.toast({ type: "info", message: "Active broker account changed. The ticket was reset." });
    }
    window.addEventListener(BROKER_CHANGED_EVENT, onBrokerChanged);
    return () => window.removeEventListener(BROKER_CHANGED_EVENT, onBrokerChanged);
  }, [reloadForNewConnection, toast]);

  // ─── Derived state ──────────────────────────────────────────────
  const isLive = connection?.environment === "live";
  const engineBlocked = engineStatus?.running === true;
  const engineState = ticketEngineState(engineStatus, loadingContext);
  const engineUnknown = engineState === "unknown";
  // Notional only with market + day/ioc per Alpaca's rules; the form
  // automatically downshifts the user's selection if they switch.
  const notionalConflict =
    sizingMode === "dollars" &&
    (orderType !== "market" || (tif !== "day" && tif !== "ioc"));
  const bracketAllowed = sizingMode === "shares";

  // Estimated cost / proceeds — informational only.
  const estimate = useCallback((): number | null => {
    const price =
      orderType === "limit" || orderType === "stop_limit"
        ? parseFloat(limitPrice)
        : quote?.price ?? null;
    if (!price || isNaN(price)) return null;
    if (sizingMode === "dollars") {
      const n = parseFloat(notional);
      return isNaN(n) ? null : n;
    }
    const q = parseFloat(qty);
    if (isNaN(q)) return null;
    return q * price;
  }, [orderType, limitPrice, quote, sizingMode, notional, qty]);

  // ─── Validation ─────────────────────────────────────────────────
  function validate(): string | null {
    if (engineBlocked) {
      return "Stop the engine before placing manual orders.";
    }
    if (engineUnknown) {
      return "Engine status unknown. Retry before placing an order.";
    }
    if (sizingMode === "shares") {
      const q = parseFloat(qty);
      if (!q || q <= 0) return "Enter a share quantity greater than 0.";
    } else {
      const n = parseFloat(notional);
      if (!n || n <= 0) return "Enter a dollar amount greater than 0.";
      if (notionalConflict) {
        return "Dollar-based orders must be market type with day or ioc TIF.";
      }
    }
    if (orderType === "limit" || orderType === "stop_limit") {
      const p = parseFloat(limitPrice);
      if (!p || p <= 0) return "Limit price required.";
    }
    if (orderType === "stop" || orderType === "stop_limit") {
      const s = parseFloat(stopPrice);
      if (!s || s <= 0) return "Stop price required.";
    }
    if (useBracket && side !== "buy") {
      return "Bracket orders are for entries (buy side) only.";
    }
    if (useBracket) {
      const hasTP = takeProfitPrice && parseFloat(takeProfitPrice) > 0;
      const hasSL = stopLossPrice && parseFloat(stopLossPrice) > 0;
      if (!hasTP && !hasSL) return "Bracket needs at least a take-profit or stop-loss.";
    }
    return null;
  }

  async function submit() {
    const err = validate();
    if (err) {
      toast.toast({ type: "error", message: err });
      return;
    }

    // Re-read the active connection before deciding on the live confirm: the
    // one loaded with the page may have been switched since, here or in
    // another tab. Fail closed if it cannot be read.
    let current: ConnectionMeta | null;
    setSubmitting(true);
    try {
      const res = await fetch("/api/broker/connections");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      current = activeConnectionFrom(await res.json());
    } catch {
      toast.toast({
        type: "error",
        message: "Could not confirm which broker account is active. Nothing was sent.",
      });
      return;
    } finally {
      setSubmitting(false);
    }
    if (!current) {
      setConnection(null);
      toast.toast({ type: "error", message: "No active broker connection. Nothing was sent." });
      return;
    }
    if (current.id !== connection?.id) {
      reloadForNewConnection();
      toast.toast({
        type: "error",
        message: `Your active broker account changed to ${current.environment === "live" ? "LIVE" : "paper"} (${current.label}). The ticket was reset: review it and submit again. Nothing was sent.`,
      });
      return;
    }
    const target = current;

    // Friction on LIVE orders — a real modal with the order summary, not the
    // browser's system dialog (2026-07-15 crisis-path UX pass).
    if (target.environment === "live") {
      const sizing = sizingMode === "dollars" ? `$${notional}` : `${qty} shares`;
      requestConfirm({
        title: `Live ${side.toUpperCase()} — real money`,
        description: (
          <>
            This order goes to your <strong className="text-text-primary">live brokerage account</strong> and
            uses real capital. Fills happen at market speed and cannot be recalled.
          </>
        ),
        summary: [
          { label: "Symbol", value: symbol },
          { label: "Side", value: side.toUpperCase(), tone: side === "buy" ? "bullish" : "bearish" },
          { label: "Size", value: sizing },
          { label: "Order type", value: orderType.replace("_", " ").toUpperCase() },
        ],
        confirmLabel: `Place LIVE ${side}`,
        tone: "irreversible",
        onConfirm: () => placeOrder(target),
      });
      return;
    }

    await placeOrder(target);
  }

  async function placeOrder(target: ConnectionMeta) {
    setSubmitting(true);
    // Set once the request is handed to fetch: before that nothing can have
    // reached the broker, and the error must say so.
    let sent = false;
    try {
      const body: Record<string, string | undefined> = {
        symbol,
        side,
        type: orderType,
        timeInForce: tif,
      };
      if (sizingMode === "shares") body.qty = qty;
      else body.notional = notional;
      if (orderType === "limit" || orderType === "stop_limit") body.limitPrice = limitPrice;
      if (orderType === "stop" || orderType === "stop_limit") body.stopPrice = stopPrice;
      if (useBracket) {
        body.orderClass = "bracket";
        if (takeProfitPrice) body.takeProfitPrice = takeProfitPrice;
        if (stopLossPrice) body.stopLossPrice = stopLossPrice;
      }

      // The account this ticket showed and the user confirmed. The route
      // refuses with 409 CONNECTION_CHANGED if another is active by now.
      body.expectedConnectionId = target.id;
      body.expectedEnvironment = target.environment;

      orderIntentRef.current = orderIntentFor(orderIntentRef.current, body);
      body.clientOrderId = orderIntentRef.current.clientOrderId;

      sent = true;
      const res = await fetch("/api/broker/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      orderIntentRef.current = orderIntentAfterResponse(orderIntentRef.current, { ok: res.ok, code: data.code });
      if (data.code === "CONNECTION_CHANGED") {
        // Refused before the broker: the active account is not the one this
        // ticket showed. Reload for the new account and make the user look.
        reloadForNewConnection();
        toast.toast({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Your active broker account changed. Nothing was sent.",
        });
        return;
      }
      if (data.code === "ORDER_STATUS_UNKNOWN") {
        // The order may be live. Keep the same clientOrderId so a resubmit
        // of this ticket is refused by the broker instead of doubling it.
        toast.toast({
          type: "error",
          message: "Order status unknown: the broker did not confirm it. Check open orders before placing it again.",
        });
        return;
      }
      if (!res.ok) {
        toast.toast({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Order rejected.",
        });
        return;
      }
      toast.toast({
        type: "success",
        message: data.deduplicated
          ? `${side.toUpperCase()} ${symbol} was already submitted; no second order placed. Status: ${data.order?.status ?? "accepted"}.`
          : `${side.toUpperCase()} ${symbol} submitted — status: ${data.order?.status ?? "accepted"}.`,
      });
      // Reset qty/notional but keep order type + side selection
      setQty("");
      setNotional("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      toast.toast({
        type: "error",
        message: sent
          ? `No answer from the server (${msg}). The order may have gone through: check open orders before placing it again.`
          : `Order not sent (${msg}). Nothing reached the broker.`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const est = estimate();
  const envLabel = connection ? (isLive ? "LIVE, real money" : "Paper account") : null;
  // Why Place is disabled, printed under it. The order matches validate().
  const blockedReason = engineBlocked
    ? "Engine is running, stop it first on the Trader page."
    : engineUnknown
      ? "Engine status unknown. Retry below."
      : !connection
        ? "No active broker connection."
        : undefined;
  const envWord = isLive ? "LIVE" : "paper";

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {confirmDialog}
      <div className="flex flex-wrap items-center gap-3">
        <SmartBackButton fallbackHref="/dashboard/analysis" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight font-mono">{symbol}</h1>
          <p className="text-sm text-text-secondary">Manual order ticket</p>
        </div>
        {envLabel &&
          (isLive ? (
            <StatusChip tone="bearish" icon={<AlertCircle className="h-3 w-3" />}>{envLabel}</StatusChip>
          ) : (
            <StatusChip tone="accent">{envLabel}</StatusChip>
          ))}
        {!quote && quoteUnavailable && (
          <div className="text-right text-sm text-text-muted">Price unavailable</div>
        )}
        {quote && (
          <div className="text-right">
            <div className="font-mono text-xl font-semibold text-text-primary tabular-nums">
              ${quote.price.toFixed(2)}
            </div>
            {quote.changePct !== undefined && (
              <div className={`text-xs font-mono tabular-nums ${quote.changePct >= 0 ? "text-bullish" : "text-bearish"}`}>
                <span aria-hidden="true">{quote.changePct >= 0 ? "▲ " : "▼ "}</span>
                {formatSignedPercent(quote.changePct)}
                <span className="sr-only"> today</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Engine running banner — blocks ticket use */}
      {engineBlocked && (
        <div className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-fill p-4">
          <ShieldAlert aria-hidden="true" className="w-5 h-5 shrink-0 text-warning mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-warning mb-1">Engine is running</p>
            <p className="text-text-secondary">
              The trading engine places its own orders and tracks positions in memory.
              Manual orders while it&apos;s active would drift the position map and may
              fire conflicting protective stops. Stop the engine on the{" "}
              <Link href="/dashboard/trader" className="text-accent hover:text-accent-hover underline">
                Trader page
              </Link>
              {" "}before placing manual orders.
            </p>
          </div>
        </div>
      )}

      {/* Live-account banner */}
      {isLive && (
        <div className="flex items-start gap-3 rounded-lg border border-bearish-line bg-bearish-fill p-4">
          <AlertCircle aria-hidden="true" className="w-5 h-5 shrink-0 text-bearish mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-bearish mb-1">LIVE ACCOUNT — real money</p>
            <p className="text-text-secondary">
              Orders placed here execute on your real brokerage account.
              Switch to a paper account in the sidebar if you&apos;re practicing.
            </p>
          </div>
        </div>
      )}

      {/* One column below lg; from lg the summary sits beside the form. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Order form */}
        <Card>
          {loadingContext ? (
            <div className="space-y-3">
              <Skeleton className="h-11" rounded="lg" />
              <Skeleton className="h-11" rounded="lg" />
              <Skeleton className="h-11" rounded="lg" />
            </div>
          ) : (
            <div className="space-y-5">
              <Segmented
                label="Order side"
                fullWidth
                value={side}
                disabled={engineBlocked}
                onChange={(v) => {
                  setSide(v);
                  if (v === "sell") setUseBracket(false);
                }}
                options={[
                  { value: "buy", label: "Buy", icon: "▲", tone: "bullish" },
                  { value: "sell", label: "Sell", icon: "▼", tone: "bearish" },
                ]}
              />

              {/* Sizing — shares vs dollars */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-text-secondary" aria-hidden="true">Size</span>
                  <Segmented
                    label="Size in"
                    value={sizingMode}
                    disabled={engineBlocked}
                    onChange={(v) => {
                      setSizingMode(v);
                      if (v === "dollars") setUseBracket(false);
                    }}
                    options={[
                      { value: "shares", label: "Shares", icon: <Hash className="w-3 h-3" /> },
                      { value: "dollars", label: "Dollars", icon: <DollarSign className="w-3 h-3" /> },
                    ]}
                  />
                </div>
                {sizingMode === "shares" ? (
                  <Input
                    id="ticket-qty"
                    aria-label="Quantity in shares"
                    type="number"
                    inputMode="decimal"
                    enterKeyHint="done"
                    step="0.001"
                    min="0"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="Number of shares (fractional allowed)"
                    disabled={engineBlocked}
                    className="font-mono"
                  />
                ) : (
                  <Input
                    id="ticket-notional"
                    aria-label="Amount in dollars"
                    type="number"
                    inputMode="decimal"
                    enterKeyHint="done"
                    step="0.01"
                    min="0"
                    value={notional}
                    onChange={(e) => setNotional(e.target.value)}
                    placeholder="Dollar amount (e.g. 100)"
                    disabled={engineBlocked}
                    className="font-mono"
                  />
                )}
                {notionalConflict && (
                  <p className="text-xs text-warning">
                    Dollar-based orders must be Market type with Day or IOC time-in-force.
                  </p>
                )}
              </div>

              {/* Order type + TIF */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Order Type"
                  help="Market = fills immediately at the current price (best for liquid stocks). Limit = only fills at your price or better. Stop / Stop-Limit = triggers when a price level is hit (use for exits)."
                  options={[
                    { value: "market", label: "Market — fill now at current price" },
                    { value: "limit", label: "Limit — only fill at my price or better" },
                    { value: "stop", label: "Stop — trigger market order at a level" },
                    { value: "stop_limit", label: "Stop-Limit — trigger limit order at a level" },
                  ]}
                  value={orderType}
                  onChange={(v) => setOrderType(v as OrderType)}
                  disabled={engineBlocked}
                />
                <Select
                  label="Time-in-Force"
                  help="Day = expires at market close (safest default). GTC = stays open until filled or cancelled. IOC = fill what you can right now, cancel the rest. FOK = fill the entire order immediately or cancel."
                  options={[
                    { value: "day", label: "Day — expires at market close" },
                    { value: "gtc", label: "GTC — good until I cancel" },
                    { value: "ioc", label: "IOC — fill what you can, cancel rest" },
                    { value: "fok", label: "FOK — fill everything or nothing" },
                  ]}
                  value={tif}
                  onChange={(v) => setTif(v as TimeInForce)}
                  disabled={engineBlocked}
                />
              </div>

              {/* Conditional prices */}
              {(orderType === "limit" || orderType === "stop_limit") && (
                <Input
                  label="Limit Price"
                  help="The maximum you'll pay to buy (or minimum you'll accept to sell). The order sits in the order book until the market reaches your price."
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  step="0.01"
                  min="0"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="0.00"
                  disabled={engineBlocked}
                  className="font-mono"
                />
              )}
              {(orderType === "stop" || orderType === "stop_limit") && (
                <Input
                  label="Stop Price"
                  help="The trigger price. Once the market touches this level, the order activates. Set BELOW current price for sells (stop-loss), ABOVE for buys (breakout entries)."
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  step="0.01"
                  min="0"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  placeholder="0.00"
                  disabled={engineBlocked}
                  className="font-mono"
                />
              )}

              {/* Bracket order — only on BUY + shares */}
              {side === "buy" && bracketAllowed && (
                <Inset className="space-y-3">
                  <div>
                    <Toggle
                      id="ticket-bracket"
                      label="Bracket order"
                      checked={useBracket}
                      onCheckedChange={setUseBracket}
                      disabled={engineBlocked}
                    />
                    <p className="text-xs text-text-muted">Atomic entry, stop and target.</p>
                  </div>
                  {useBracket && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="Take-Profit"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={takeProfitPrice}
                        onChange={(e) => setTakeProfitPrice(e.target.value)}
                        placeholder="Sell limit"
                        disabled={engineBlocked}
                        className="font-mono"
                      />
                      <Input
                        label="Stop-Loss"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={stopLossPrice}
                        onChange={(e) => setStopLossPrice(e.target.value)}
                        placeholder="Sell stop"
                        disabled={engineBlocked}
                        className="font-mono"
                      />
                    </div>
                  )}
                </Inset>
              )}
            </div>
          )}
        </Card>

        {/* Summary and submit: sticky beside the form from lg up. */}
        <Card className="space-y-4 lg:sticky lg:top-4">
          <div className="flex items-center gap-3 min-w-0">
            <Briefcase aria-hidden="true" className="w-5 h-5 text-text-muted shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">
                {connection ? `${connection.broker} · ${connection.environment}` : "—"}
              </div>
              <div className="text-xs text-text-muted truncate">
                {connection?.label ?? "No active broker connection"}
              </div>
            </div>
          </div>

          <Inset as="dl" className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-secondary">Estimated {side === "buy" ? "cost" : "proceeds"}</dt>
              <dd className="font-mono font-semibold tabular-nums text-text-primary">
                {est != null
                  ? `$${est.toFixed(2)}`
                  : quoteUnavailable && (orderType === "market" || orderType === "stop")
                    ? "Price unavailable"
                    : "—"}
              </dd>
            </div>
            {account && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Buying power</dt>
                  <dd className="font-mono tabular-nums text-text-primary">${account.buyingPower.toFixed(2)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Equity</dt>
                  <dd className="font-mono tabular-nums text-text-primary">${account.equity.toFixed(2)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-secondary">Cash</dt>
                  <dd className="font-mono tabular-nums text-text-primary">${account.cash.toFixed(2)}</dd>
                </div>
              </>
            )}
          </Inset>

          {/* Submit: the label names the account and the side. */}
          <div className="[&>span]:w-full">
            <Button
              variant={side === "buy" ? "primary" : "destructive"}
              onClick={submit}
              disabled={loadingContext || engineBlocked || engineUnknown || submitting || !connection}
              disabledReason={loadingContext ? undefined : blockedReason}
              loading={submitting}
              className="w-full"
            >
              Place {envWord} {side}
            </Button>
          </div>
          {engineUnknown && (
            <p role="status" className="flex flex-wrap items-center gap-x-2 text-xs text-warning">
              Engine status unknown, so orders are off until it is read.
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLoadingContext(true);
                  void loadContext();
                }}
              >
                Retry
              </Button>
            </p>
          )}
          {!connection && !loadingContext && (
            <p className="text-xs text-text-muted">
              <Link href="/dashboard/settings" className="text-accent hover:text-accent-hover underline">
                Connect one
              </Link>{" "}
              or pick one in the sidebar.
            </p>
          )}

          {/* Status */}
          <div className="flex flex-wrap gap-2">
            {engineState === "running" ? (
              <StatusChip tone="warning" icon={<ShieldAlert className="h-3 w-3" />}>Engine running, orders blocked</StatusChip>
            ) : engineState === "stopped" ? (
              <StatusChip>Engine stopped</StatusChip>
            ) : engineUnknown ? (
              <StatusChip tone="warning" icon={<AlertCircle className="h-3 w-3" />}>Engine status unknown</StatusChip>
            ) : (
              <StatusChip>Checking engine</StatusChip>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
