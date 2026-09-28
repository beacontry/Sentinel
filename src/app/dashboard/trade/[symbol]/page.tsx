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
//
// The page owns sending. What it reads is in use-ticket-context.ts, the
// rules (estimate, validation, the request body, the resulting position)
// in src/lib/order-ticket.ts, and the rendering in src/components/trade-ticket/.

import { useEffect, useState, useCallback, useRef, use } from "react";
import { Plug } from "lucide-react";
import { orderIntentFor, orderIntentAfterResponse, type OrderIntent } from "@/lib/order-intent";
import { BROKER_CHANGED_EVENT } from "@/lib/broker-events";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion } from "@/components/ui/live-region";
import { useToast } from "@/components/ui/toast";
import { useConfirmAction } from "@/components/ui/confirm-action-modal";
import { EnvironmentStrip } from "@/components/trader/environment-strip";
import { DeskAlert } from "@/components/trader/desk-alert";
import { meaningfulLabel, type BrokerContext } from "@/components/trader/broker-context";
import { TicketHeader } from "@/components/trade-ticket/ticket-header";
import { OrderForm, OrderFormSkeleton } from "@/components/trade-ticket/order-form";
import { OrderSummary, OrderSummarySkeleton } from "@/components/trade-ticket/order-summary";
import {
  activeConnectionFrom,
  useTicketContext,
  type ConnectionMeta,
} from "@/components/trade-ticket/use-ticket-context";
import { ticketEngineState } from "@/lib/trader-view";
import {
  INITIAL_TICKET,
  estimateBasis,
  estimateOrderValue,
  orderRequestBody,
  resetSizing,
  resultingPosition,
  usesLimitPrice,
  validateTicket,
  type TicketAccount,
  type TicketFields,
} from "@/lib/order-ticket";

export default function TradePage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: rawSymbol } = use(params);
  const symbol = rawSymbol.toUpperCase();
  const toast = useToast();
  const { requestConfirm, dialog: confirmDialog } = useConfirmAction();
  const ctx = useTicketContext(symbol);

  const [fields, setFields] = useState<TicketFields>(INITIAL_TICKET);
  const updateFields = useCallback((patch: Partial<TicketFields>) => setFields((f) => ({ ...f, ...patch })), []);
  const [submitting, setSubmitting] = useState(false);

  // Idempotency key for the order intent on the ticket. Minted on the first
  // submit, reused on every resubmit of the same order so the broker refuses
  // a duplicate, and replaced only after a success or when the order changes.
  const orderIntentRef = useRef<OrderIntent | null>(null);

  // Another account became active (this tab's switcher, or another tab or
  // device as seen by the switcher's poll, a pre-submit re-read that finds a
  // different account, or the route's 409 CONNECTION_CHANGED): drop this
  // account's context, the sizes on the form and the order intent, and load
  // the new one, so the strip and the confirm follow it. Side, order type
  // and TIF are kept.
  const { reloadForNewAccount } = ctx;
  const reloadForNewConnection = useCallback(() => {
    setFields(resetSizing);
    orderIntentRef.current = null;
    reloadForNewAccount();
  }, [reloadForNewAccount]);

  useEffect(() => {
    function onBrokerChanged() {
      reloadForNewConnection();
      toast.toast({ type: "info", message: "Active broker account changed. The ticket was reset." });
    }
    window.addEventListener(BROKER_CHANGED_EVENT, onBrokerChanged);
    return () => window.removeEventListener(BROKER_CHANGED_EVENT, onBrokerChanged);
  }, [reloadForNewConnection, toast]);

  // ─── Derived state ──────────────────────────────────────────────
  const { connection, engineStatus, loadingContext, quote, quoteState } = ctx;
  const engineBlocked = engineStatus?.running === true;
  const engineState = ticketEngineState(engineStatus, loadingContext);
  const engineUnknown = engineState === "unknown";
  const accountKind: TicketAccount = connection
    ? connection.environment
    : loadingContext
      ? "loading"
      : ctx.connectionFailed
        ? "unknown"
        : "none";
  const quotePrice = quote?.price ?? null;
  const estimate = estimateOrderValue(fields, quotePrice);

  async function submit() {
    const err = validateTicket(fields, { blocked: engineBlocked, unknown: engineUnknown });
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
      ctx.clearConnection();
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
      const sizing = fields.sizingMode === "dollars" ? `$${fields.notional}` : `${fields.qty} shares`;
      requestConfirm({
        title: `Live ${fields.side.toUpperCase()} — real money`,
        description: (
          <>
            This order goes to your <strong className="text-text-primary">live brokerage account</strong> and
            uses real capital. Fills happen at market speed and cannot be recalled.
          </>
        ),
        summary: [
          { label: "Symbol", value: symbol },
          { label: "Side", value: fields.side.toUpperCase(), tone: fields.side === "buy" ? "bullish" : "bearish" },
          { label: "Size", value: sizing },
          { label: "Order type", value: fields.orderType.replace("_", " ").toUpperCase() },
        ],
        confirmLabel: `Place LIVE ${fields.side}`,
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
      const body = orderRequestBody(symbol, fields);

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
          ? `${fields.side.toUpperCase()} ${symbol} was already submitted; no second order placed. Status: ${data.order?.status ?? "accepted"}.`
          : `${fields.side.toUpperCase()} ${symbol} submitted — status: ${data.order?.status ?? "accepted"}.`,
      });
      // Reset qty/notional but keep order type + side selection
      updateFields({ qty: "", notional: "" });
      // The holding and buying power the summary shows have moved (or will
      // on the fill): read them again rather than show the pre-order ones.
      void ctx.refreshAccount();
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

  const strip: BrokerContext =
    accountKind === "loading"
      ? { status: "loading" }
      : connection
        ? {
            status: "ready",
            environment: connection.environment,
            broker: connection.broker,
            label: meaningfulLabel(connection.label),
          }
        : { status: "error" };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 lg:space-y-6 lg:p-6">
      {confirmDialog}

      {/* Which account an order goes to, above everything. With no broker at
          all, the empty state below says so instead. */}
      {accountKind !== "none" && (
        <EnvironmentStrip
          broker={strip}
          engineLive={engineStatus?.running && engineStatus.environment === "live" ? { accountTail: null } : null}
          onRetry={ctx.reload}
        />
      )}

      <TicketHeader
        symbol={symbol}
        quote={quote}
        quoteState={quoteState}
        refreshing={ctx.refreshingQuote}
        onRefreshQuote={() => void ctx.refreshQuote()}
      />

      {engineBlocked && (
        <DeskAlert
          tone="warning"
          title="Engine is running"
          action={
            <ButtonLink href="/dashboard/trader" variant="secondary" size="sm" className="w-full sm:w-auto">
              Open Trader
            </ButtonLink>
          }
        >
          The trading engine places its own orders and tracks positions in memory. Manual orders while it is active
          would drift its position map and may fire conflicting protective stops. Stop it on the Trader page first.
        </DeskAlert>
      )}

      {accountKind === "none" ? (
        <section className="rounded-xl border border-border bg-bg-secondary shadow-card">
          <EmptyState
            kind="not-connected"
            icon={<Plug className="h-6 w-6" />}
            title="No broker connected"
            description={`Connect a paper or live account to place orders for ${symbol}. If you have one, pick it in the account switcher at the top.`}
            headingLevel={2}
          />
        </section>
      ) : (
        <LoadingRegion
          label="the order ticket"
          busy={!ctx.loaded}
          className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6"
        >
          {ctx.loaded ? (
            <OrderForm fields={fields} onChange={updateFields} disabled={engineBlocked || loadingContext} />
          ) : (
            <OrderFormSkeleton />
          )}
          {ctx.loaded ? (
            <OrderSummary
              side={fields.side}
              estimate={estimate}
              estimateNeedsPrice={quoteState === "unavailable" && !usesLimitPrice(fields.orderType)}
              basis={estimateBasis(fields, quotePrice)}
              buyingPower={ctx.buyingPower}
              held={ctx.held}
              result={resultingPosition(ctx.held, fields, quotePrice)}
              account={accountKind}
              engine={engineState}
              reading={loadingContext}
              submitting={submitting}
              onSubmit={submit}
              onRetryEngine={ctx.reload}
            />
          ) : (
            <OrderSummarySkeleton />
          )}
        </LoadingRegion>
      )}
    </div>
  );
}
