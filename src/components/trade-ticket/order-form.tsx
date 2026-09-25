"use client";

import { DollarSign, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Inset } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bracketOffered,
  notionalConflict,
  usesLimitPrice,
  usesStopPrice,
  type OrderType,
  type TicketFields,
  type TimeInForce,
} from "@/lib/order-ticket";

/**
 * The order itself, top to bottom in the order a trader decides it: side,
 * size, how it executes, the prices that execution needs, and an optional
 * bracket. Every field opens the decimal keypad on a phone. Switching to
 * Sell or to Dollars drops the bracket, which is offered only on a
 * share-count buy.
 */

interface OrderFormProps {
  fields: TicketFields;
  onChange: (patch: Partial<TicketFields>) => void;
  /** The engine is running, or the account is being read again. */
  disabled: boolean;
}

const PANEL = "min-w-0 rounded-xl border border-border bg-bg-secondary p-4 shadow-card lg:p-5";

const priceProps = {
  type: "number",
  inputMode: "decimal",
  enterKeyHint: "done",
  step: "0.01",
  min: "0",
  className: "font-mono",
} as const;

export function OrderForm({ fields: f, onChange, disabled }: OrderFormProps) {
  const conflict = notionalConflict(f);
  return (
    <section aria-labelledby="ticket-order-heading" className={PANEL}>
      <h2 id="ticket-order-heading" className="sr-only">
        Order
      </h2>
      <div className="space-y-6">
        <Segmented
          label="Order side"
          fullWidth
          value={f.side}
          disabled={disabled}
          onChange={(v) => onChange(v === "sell" ? { side: v, useBracket: false } : { side: v })}
          options={[
            { value: "buy", label: "Buy", icon: "▲", tone: "bullish" },
            { value: "sell", label: "Sell", icon: "▼", tone: "bearish" },
          ]}
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={f.sizingMode === "shares" ? "ticket-qty" : "ticket-notional"} className="text-sm font-medium text-text-primary">
              {f.sizingMode === "shares" ? "Quantity" : "Amount"}
            </label>
            <Segmented
              label="Size in"
              value={f.sizingMode}
              disabled={disabled}
              onChange={(v) => onChange(v === "dollars" ? { sizingMode: v, useBracket: false } : { sizingMode: v })}
              options={[
                { value: "shares", label: "Shares", icon: <Hash className="h-3 w-3" /> },
                { value: "dollars", label: "Dollars", icon: <DollarSign className="h-3 w-3" /> },
              ]}
            />
          </div>
          {f.sizingMode === "shares" ? (
            <Input
              id="ticket-qty"
              aria-describedby="ticket-size-hint"
              {...priceProps}
              step="0.001"
              value={f.qty}
              onChange={(e) => onChange({ qty: e.target.value })}
              placeholder="0"
              disabled={disabled}
            />
          ) : (
            <Input
              id="ticket-notional"
              aria-describedby="ticket-size-hint"
              {...priceProps}
              value={f.notional}
              onChange={(e) => onChange({ notional: e.target.value })}
              placeholder="0.00"
              disabled={disabled}
            />
          )}
          <p id="ticket-size-hint" className={`text-xs ${conflict ? "text-warning" : "text-text-muted"}`}>
            {conflict
              ? "Dollar-based orders must be Market type with Day or IOC time-in-force."
              : f.sizingMode === "shares"
                ? "Shares, fractional allowed."
                : "Dollars to spend or raise. Market orders with Day or IOC only."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-[var(--color-hairline-inner)] pt-5 sm:grid-cols-2">
          <Select
            label="Order type"
            help="Market = fills immediately at the current price (best for liquid stocks). Limit = only fills at your price or better. Stop / Stop-Limit = triggers when a price level is hit (use for exits)."
            options={[
              { value: "market", label: "Market, fill now" },
              { value: "limit", label: "Limit, my price or better" },
              { value: "stop", label: "Stop, market at a level" },
              { value: "stop_limit", label: "Stop-limit, limit at a level" },
            ]}
            value={f.orderType}
            onChange={(v) => onChange({ orderType: v as OrderType })}
            disabled={disabled}
          />
          <Select
            label="Time in force"
            help="Day = expires at market close (safest default). GTC = stays open until filled or cancelled. IOC = fill what you can right now, cancel the rest. FOK = fill the entire order immediately or cancel."
            options={[
              { value: "day", label: "Day, until the close" },
              { value: "gtc", label: "GTC, until cancelled" },
              { value: "ioc", label: "IOC, fill now or cancel rest" },
              { value: "fok", label: "FOK, all or nothing" },
            ]}
            value={f.tif}
            onChange={(v) => onChange({ tif: v as TimeInForce })}
            disabled={disabled}
          />
          {usesLimitPrice(f.orderType) && (
            <Input
              label="Limit price"
              help="The maximum you'll pay to buy (or minimum you'll accept to sell). The order sits in the order book until the market reaches your price."
              {...priceProps}
              value={f.limitPrice}
              onChange={(e) => onChange({ limitPrice: e.target.value })}
              placeholder="0.00"
              disabled={disabled}
            />
          )}
          {usesStopPrice(f.orderType) && (
            <Input
              label="Stop price"
              help="The trigger price. Once the market touches this level, the order activates. Set BELOW current price for sells (stop-loss), ABOVE for buys (breakout entries)."
              {...priceProps}
              value={f.stopPrice}
              onChange={(e) => onChange({ stopPrice: e.target.value })}
              placeholder="0.00"
              disabled={disabled}
            />
          )}
        </div>

        {bracketOffered(f) && (
          <Inset className="space-y-3">
            <div>
              <Toggle
                id="ticket-bracket"
                label="Bracket order"
                checked={f.useBracket}
                onCheckedChange={(v) => onChange({ useBracket: v })}
                disabled={disabled}
              />
              <p className="text-xs text-text-muted">Entry, stop and target sent as one order.</p>
            </div>
            {f.useBracket && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Take profit"
                  {...priceProps}
                  value={f.takeProfitPrice}
                  onChange={(e) => onChange({ takeProfitPrice: e.target.value })}
                  placeholder="Sell limit"
                  disabled={disabled}
                />
                <Input
                  label="Stop loss"
                  {...priceProps}
                  value={f.stopLossPrice}
                  onChange={(e) => onChange({ stopLossPrice: e.target.value })}
                  placeholder="Sell stop"
                  disabled={disabled}
                />
              </div>
            )}
          </Inset>
        )}
      </div>
    </section>
  );
}

/** The form's shape while the first read is in flight. */
export function OrderFormSkeleton() {
  return (
    <div className={PANEL} aria-hidden="true">
      <div className="space-y-6">
        <Skeleton className="h-12" rounded="lg" />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-12 w-44" rounded="lg" />
          </div>
          <Skeleton className="h-11" rounded="lg" />
        </div>
        <div className="grid grid-cols-1 gap-4 border-t border-[var(--color-hairline-inner)] pt-5 sm:grid-cols-2">
          <Skeleton className="h-16" rounded="lg" />
          <Skeleton className="h-16" rounded="lg" />
        </div>
      </div>
    </div>
  );
}
