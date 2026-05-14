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

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { SmartBackButton } from "@/components/ui/smart-back-button";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

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

  // Engine + account context
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [connection, setConnection] = useState<ConnectionMeta | null>(null);
  const [quote, setQuote] = useState<QuoteSnapshot | null>(null);
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
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [engineRes, accountRes, connectionsRes, quoteRes] = await Promise.all([
          fetch("/api/trader/engine"),
          fetch("/api/broker/account"),
          fetch("/api/broker/connections"),
          fetch(`/api/analyze?symbol=${encodeURIComponent(symbol)}`),
        ]);
        if (cancelled) return;
        if (engineRes.ok) {
          const d = await engineRes.json();
          setEngineStatus({
            running: d.data?.running === true,
            environment: d.data?.environment ?? null,
          });
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
          const d = await connectionsRes.json();
          const active = (d.connections ?? []).find((c: ConnectionMeta) => c.isActive);
          if (active) setConnection(active);
        }
        if (quoteRes.ok) {
          const d = await quoteRes.json();
          const bars = d.bars ?? [];
          if (bars.length >= 2) {
            const last = bars[bars.length - 1].close;
            const prev = bars[bars.length - 2].close;
            setQuote({
              price: last,
              changePct: ((last - prev) / prev) * 100,
            });
          } else if (bars.length === 1) {
            setQuote({ price: bars[0].close, changePct: undefined });
          }
        }
      } catch {
        // Non-critical — fields can still be filled in manually
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // ─── Derived state ──────────────────────────────────────────────
  const isLive = connection?.environment === "live";
  const engineBlocked = engineStatus?.running === true;
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

    // Friction on LIVE orders
    if (isLive) {
      const where = sizingMode === "dollars" ? `$${notional}` : `${qty} shares`;
      const ok = confirm(
        `LIVE ${side.toUpperCase()}: ${where} of ${symbol}\n\nThis will use REAL money on your live brokerage account. Proceed?`
      );
      if (!ok) return;
    }

    setSubmitting(true);
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

      const res = await fetch("/api/broker/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.toast({
          type: "error",
          message: typeof data.error === "string" ? data.error : "Order rejected.",
        });
        return;
      }
      toast.toast({
        type: "success",
        message: `${side.toUpperCase()} ${symbol} submitted — status: ${data.order?.status ?? "accepted"}.`,
      });
      // Reset qty/notional but keep order type + side selection
      setQty("");
      setNotional("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      toast.toast({
        type: "error",
        message: `Order couldn't reach the broker (${msg}). Check your connection and retry.`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <SmartBackButton fallbackHref="/dashboard/analysis" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight font-mono">{symbol}</h1>
          <p className="text-sm text-text-secondary">Manual order ticket</p>
        </div>
        {quote && (
          <div className="text-right">
            <div className="font-mono text-xl font-semibold text-text-primary">
              ${quote.price.toFixed(2)}
            </div>
            {quote.changePct !== undefined && (
              <div
                className={`text-xs font-mono ${
                  quote.changePct >= 0 ? "text-bullish" : "text-bearish"
                }`}
              >
                {quote.changePct >= 0 ? "+" : ""}
                {quote.changePct.toFixed(2)}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Engine running banner — blocks ticket use */}
      {engineBlocked && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <ShieldAlert className="w-5 h-5 shrink-0 text-warning mt-0.5" />
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
        <div className="flex items-start gap-3 rounded-lg border border-bearish/30 bg-bearish/10 p-4">
          <AlertCircle className="w-5 h-5 shrink-0 text-bearish mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-bearish mb-1">LIVE ACCOUNT — real money</p>
            <p className="text-text-secondary">
              Orders placed here execute on your real brokerage account.
              Switch to a paper account in the sidebar if you&apos;re practicing.
            </p>
          </div>
        </div>
      )}

      {/* Account + connection info card */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Briefcase className="w-5 h-5 text-text-muted shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">
                {connection ? `${connection.broker} · ${connection.environment}` : "—"}
              </div>
              <div className="text-xs text-text-muted truncate">
                {connection?.label ?? "No active broker connection"}
              </div>
            </div>
          </div>
          {account && (
            <div className="flex gap-6 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Equity</div>
                <div className="font-mono text-sm text-text-primary">
                  ${account.equity.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Buying Power</div>
                <div className="font-mono text-sm text-accent">
                  ${account.buyingPower.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Cash</div>
                <div className="font-mono text-sm text-text-primary">
                  ${account.cash.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Order form */}
      <Card>
        {loadingContext ? (
          <div className="space-y-3">
            <Skeleton className="h-10" rounded="lg" />
            <Skeleton className="h-10" rounded="lg" />
            <Skeleton className="h-10" rounded="lg" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Side toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSide("buy")}
                disabled={engineBlocked}
                className={`min-h-[44px] rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-colors
                  ${side === "buy"
                    ? "border-bullish bg-bullish/10 text-bullish"
                    : "border-border text-text-secondary hover:border-border-hover"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                BUY
              </button>
              <button
                onClick={() => { setSide("sell"); setUseBracket(false); }}
                disabled={engineBlocked}
                className={`min-h-[44px] rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-colors
                  ${side === "sell"
                    ? "border-bearish bg-bearish/10 text-bearish"
                    : "border-border text-text-secondary hover:border-border-hover"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                SELL
              </button>
            </div>

            {/* Sizing — shares vs dollars */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-text-secondary">Size</label>
                <div className="flex gap-1 rounded-lg border border-border p-0.5">
                  <button
                    onClick={() => setSizingMode("shares")}
                    disabled={engineBlocked}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors
                      ${sizingMode === "shares"
                        ? "bg-bg-elevated text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                      } disabled:opacity-50`}
                  >
                    <Hash className="w-3 h-3" />
                    Shares
                  </button>
                  <button
                    onClick={() => { setSizingMode("dollars"); setUseBracket(false); }}
                    disabled={engineBlocked}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors
                      ${sizingMode === "dollars"
                        ? "bg-bg-elevated text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                      } disabled:opacity-50`}
                  >
                    <DollarSign className="w-3 h-3" />
                    Dollars
                  </button>
                </div>
              </div>
              {sizingMode === "shares" ? (
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="Number of shares (fractional allowed)"
                  disabled={engineBlocked}
                />
              ) : (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={notional}
                  onChange={(e) => setNotional(e.target.value)}
                  placeholder="Dollar amount (e.g. 100)"
                  disabled={engineBlocked}
                />
              )}
              {notionalConflict && (
                <p className="mt-1 text-[11px] text-warning">
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
                step="0.01"
                min="0"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder="0.00"
                disabled={engineBlocked}
              />
            )}
            {(orderType === "stop" || orderType === "stop_limit") && (
              <Input
                label="Stop Price"
                help="The trigger price. Once the market touches this level, the order activates. Set BELOW current price for sells (stop-loss), ABOVE for buys (breakout entries)."
                type="number"
                step="0.01"
                min="0"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                placeholder="0.00"
                disabled={engineBlocked}
              />
            )}

            {/* Bracket order — only on BUY + shares */}
            {side === "buy" && bracketAllowed && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useBracket}
                    onChange={(e) => setUseBracket(e.target.checked)}
                    disabled={engineBlocked}
                    className="rounded border-border"
                  />
                  <span className="text-text-primary font-medium">Bracket order</span>
                  <span className="text-xs text-text-muted">(atomic entry + stop + target)</span>
                </label>
                {useBracket && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <Input
                      label="Take-Profit"
                      type="number"
                      step="0.01"
                      min="0"
                      value={takeProfitPrice}
                      onChange={(e) => setTakeProfitPrice(e.target.value)}
                      placeholder="Sell limit"
                      disabled={engineBlocked}
                    />
                    <Input
                      label="Stop-Loss"
                      type="number"
                      step="0.01"
                      min="0"
                      value={stopLossPrice}
                      onChange={(e) => setStopLossPrice(e.target.value)}
                      placeholder="Sell stop"
                      disabled={engineBlocked}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Estimate */}
            <div className="flex items-center justify-between rounded-lg bg-bg-secondary border border-border px-4 py-3">
              <span className="text-xs uppercase tracking-wider text-text-muted">
                Estimated {side === "buy" ? "Cost" : "Proceeds"}
              </span>
              <span className="font-mono text-base font-semibold text-text-primary">
                {estimate() != null ? `$${estimate()!.toFixed(2)}` : "—"}
              </span>
            </div>

            {/* Submit */}
            <Button
              size="lg"
              variant={side === "buy" ? "primary" : "destructive"}
              onClick={submit}
              disabled={engineBlocked || submitting || !connection}
              loading={submitting}
              className="w-full"
            >
              {isLive ? "Place LIVE " : "Place "}{side.toUpperCase()} order
            </Button>
            {!connection && !loadingContext && (
              <p className="text-center text-xs text-text-muted">
                No active broker connection.{" "}
                <Link href="/dashboard/settings" className="text-accent hover:text-accent-hover underline">
                  Connect one
                </Link>{" "}
                or pick one in the sidebar.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Status pill row */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant={engineBlocked ? "warning" : "default"}>
          {engineBlocked ? "Engine running — orders blocked" : "Engine stopped"}
        </Badge>
        {connection && (
          <Badge variant={isLive ? "bearish" : "default"}>
            {connection.broker} · {isLive ? "LIVE" : "Paper"}
          </Badge>
        )}
      </div>
    </div>
  );
}
