"use client";

import { DollarSign } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SignedValue } from "@/components/ui/signed-value";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetFacts, WidgetFigure } from "./widget-body";

interface TodayPnl {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  tradesCount: number;
  /** Start-of-day equity, when the server has it: the basis for a percent. */
  startEquity?: number;
}
interface LifetimePnl {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  /** Current equity; omitted when the broker is unreachable. */
  equity?: number;
}
interface PnlData {
  today: TodayPnl | null;
  lifetime: LifetimePnl | null;
  connected: boolean;
}

/**
 * Today's P&L as the headline, then lifetime realized (banked) and
 * unrealized (still riding) and today's trade count. Every figure is a
 * SignedValue: glyph, sign and a hidden "gain" or "loss", never colour
 * alone. A percent appears only when the server sends its basis.
 */
export function PnlWidget() {
  const { pnlFormat } = useDisplayPrefs();
  const load = useWidgetLoad<PnlData>(async (signal) => {
    const data = await fetchWidgetJson<{
      todayPnl?: TodayPnl | null;
      lifetimePnl?: LifetimePnl | null;
      status?: { connected?: boolean };
    }>("/api/trader/dashboard", signal);
    return { today: data.todayPnl ?? null, lifetime: data.lifetimePnl ?? null, connected: data.status?.connected !== false };
  });

  return (
    <WidgetBody
      load={load}
      label="today's P&L"
      skeleton={
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-1.5 h-8 w-40" />
          <div className="mt-3 space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        </div>
      }
      isEmpty={(d) => d.today === null}
      empty={
        load.data?.connected === false ? (
          <EmptyState compact kind="not-connected" icon={<DollarSign />} title="No broker connected" description="Connect a broker to see your P&L here." />
        ) : (
          <EmptyState compact icon={<DollarSign />} title="No P&L today yet" description="It starts with the first fill or the first price move on an open position." />
        )
      }
    >
      {({ today, lifetime }) => {
        if (!today) return null;
        const realized = lifetime?.realizedPnl ?? today.realizedPnl;
        const unrealized = lifetime?.unrealizedPnl ?? today.unrealizedPnl;
        return (
          <div>
            <WidgetFigure label="Today">
              <SignedValue value={today.totalPnl} basis={today.startEquity} format={pnlFormat} />
            </WidgetFigure>
            <WidgetFacts
              items={[
                { label: "Realized, lifetime", value: <SignedValue value={realized} basis={lifetime?.equity} format={pnlFormat} /> },
                { label: "Unrealized, open positions", value: <SignedValue value={unrealized} basis={lifetime?.equity} format={pnlFormat} /> },
                { label: "Trades today", value: today.tradesCount },
              ]}
            />
          </div>
        );
      }}
    </WidgetBody>
  );
}
