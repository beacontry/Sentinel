"use client";

import { useState } from "react";
import { Inbox, Plus, Search, Star, Trash2, X } from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader, CardTitle, Inset } from "@/components/ui/card";
import { ConfirmSummary } from "@/components/ui/confirm-action-modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search-input";
import { Toggle } from "@/components/ui/toggle";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip, OrderStatusChip } from "@/components/ui/status-chip";
import { SignalBadge } from "@/components/ui/signal-badge";
import { SignedValue } from "@/components/ui/signed-value";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingRegion } from "@/components/ui/live-region";
import { useToast } from "@/components/ui/toast";

const noop = () => {};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  );
}

/**
 * Every primitive in every state. Rendered by the admin page and by the
 * static harness in scripts/capture-redesign.mjs, which screenshots it in
 * each theme and runs the keyboard and 44px checks without a database.
 */
export function UiKitGallery() {
  const { toast } = useToast();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [tab, setTab] = useState("one");
  const [on, setOn] = useState(true);
  const [select, setSelect] = useState("day");
  const [units, setUnits] = useState<"shares" | "dollars">("shares");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-6">
      <PageIntro
        title="UI kit"
        description="Every primitive in every state, for screenshots in each theme and a keyboard pass. Sample data only."
        stats={[
          { label: "Today", value: <SignedValue value={1284.5} /> },
          { label: "Open P&L", value: <SignedValue value={-312.1} /> },
          { label: "Flat", value: <SignedValue value={0} /> },
          { label: "Connection", value: "Connected" },
        ]}
      />

      <Section title="Buttons">
        <div className="flex flex-wrap items-start gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Cancel order</Button>
          <Button variant="danger">Place LIVE sell</Button>
          <Button size="sm" variant="secondary">Small</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button disabled disabledReason="Engine is running, stop it first">Place paper buy</Button>
          <ButtonLink href="/dashboard" variant="secondary">Link as button</ButtonLink>
        </div>
        {/* The tight rows the app uses for row actions: the hit-area check
            asserts neither button's pseudo reaches over its neighbour. */}
        <div className="mt-3 flex flex-wrap items-center gap-6">
          <div data-kit="tight-row" className="flex items-center gap-0.5">
            <Button size="sm" variant="ghost" aria-label="Make default"><Star className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Delete watchlist"><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div data-kit="tight-row" className="flex items-center gap-1">
            <Button size="sm" variant="secondary">Edit</Button>
            <Button size="sm" variant="destructive">Delete</Button>
          </div>
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Quantity" inputMode="decimal" enterKeyHint="done" placeholder="0" />
          <Input label="Limit price" error="Enter a price above zero" defaultValue="-1" />
          <Input label="Disabled" disabled defaultValue="100" />
          <Input label="With icon" icon={<Search className="h-4 w-4" />} placeholder="Symbol" />
          <Select
            label="Time in force"
            value={select}
            onChange={setSelect}
            options={[
              { value: "day", label: "Day" },
              { value: "gtc", label: "Good till canceled" },
            ]}
          />
          <Select label="Account" options={[{ value: "a", label: "Paper" }]} error="Choose an account" />
          <Textarea label="Notes" placeholder="Why this trade" />
          <SearchInput onSearch={noop} placeholder="Search symbols" />
          <Toggle label="Colour-blind mode" checked={on} onCheckedChange={setOn} />
          <Toggle label="Disabled toggle" checked={false} disabled />
        </div>
      </Section>

      <Section title="Segmented and tabs">
        <div className="flex flex-col gap-4">
          <Segmented
            label="Order side"
            value={side}
            onChange={setSide}
            options={[
              { value: "buy", label: "Buy", icon: "▲", tone: "bullish" },
              { value: "sell", label: "Sell", icon: "▼", tone: "bearish" },
            ]}
          />
          <Segmented
            label="Order type"
            value={orderType}
            onChange={setOrderType}
            options={[
              { value: "market", label: "Market" },
              { value: "limit", label: "Limit" },
              { value: "stop", label: "Stop" },
            ]}
          />
          <Segmented
            label="Size in"
            value={units}
            onChange={setUnits}
            options={[
              { value: "shares", label: "Shares" },
              { value: "dollars", label: "Dollars" },
            ]}
          />
          <Segmented label="Engine mode" value={null} onChange={noop} busy options={[{ value: "a", label: "Loading" }]} />
          <Tabs
            tabs={[
              { id: "one", label: "Overview" },
              { id: "two", label: "Signals" },
            ]}
            activeTab={tab}
            onChange={setTab}
          />
          <TabPanel active={tab === "one"}>
            <Input label="Survives a tab switch" placeholder="Type, switch, come back" />
          </TabPanel>
          <TabPanel active={tab === "two"}>
            <p className="text-sm text-text-secondary">Second panel.</p>
          </TabPanel>
        </div>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="bullish" icon="▲">Gain</StatusChip>
          <StatusChip tone="bearish" icon="▼">Loss</StatusChip>
          <StatusChip tone="warning">Warning</StatusChip>
          <StatusChip tone="accent">Paper account</StatusChip>
          <StatusChip>Neutral</StatusChip>
          {["new", "partially_filled", "filled", "canceled", "rejected", "held_for_review"].map((s) => (
            <OrderStatusChip key={s} status={s} />
          ))}
          <SignalBadge signal="STRONG_BUY" />
          <SignalBadge signal="HOLD" />
          <SignalBadge signal="SELL" />
        </div>
        <Inset className="mt-4 flex flex-wrap gap-6 text-sm">
          <SignedValue value={42.13} />
          <SignedValue value={-7.5} basis={500} format="both" />
          <SignedValue value={0.001} />
          <SignedValue value={null} />
        </Inset>
      </Section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Win rate" value="58%" subtext="Last 30 days" />
        <StatCard label="Best day" value="+$412.00" tone="positive" direction="gain" />
        <StatCard label="Max drawdown" value={"−8.4%"} tone="negative" />
        <StatCard label="Open P&L" value={<SignedValue value={0} />} subtext="Flat, so no direction word" />
      </div>

      <Section title="Stat tiles inside a panel">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard surface="inset" label="Trades" value="42" />
          <StatCard surface="inset" label="Return" value="+3.1%" tone="positive" direction="gain" />
          <StatCard surface="inset" label="Max DD" value="6.2%" tone="negative" />
          <StatCard surface="inset" label="Sharpe" value="n/a" />
        </div>
      </Section>

      <Section title="Positioned small button">
        {/* The watchlist tile: a stretched link with a corner action. A
            sm Button must keep the position its caller gives it. */}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {["AAPL", "MSFT"].map((sym) => (
            <li key={sym} data-kit="tile" className="relative rounded-lg bg-bg-surface p-3">
              <a href="#" className="font-mono font-semibold text-text-primary after:absolute after:inset-0">
                {sym}
              </a>
              <Button
                data-kit="tile-remove"
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 z-10 w-9 px-0"
                aria-label={`Remove ${sym}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <div className="mt-1 font-mono text-sm tabular-nums">$189.20</div>
            </li>
          ))}
        </ul>
      </Section>

      {/* The confirm dialog is bg-surface; its summary must stay bounded on it. */}
      <div data-kit="dialog-surface" className="rounded-xl border border-border bg-bg-surface p-6 shadow-modal">
        <h2 className="text-lg font-semibold text-text-primary">Confirm dialog summary</h2>
        <ConfirmSummary
          rows={[
            { label: "Shares", value: "10" },
            { label: "Current price", value: "$189.20" },
            { label: "Unrealized P&L", value: <SignedValue value={-12.4} /> },
            { label: "Unknown P&L", value: <SignedValue value={null} /> },
          ]}
        />
      </div>

      <Section title="Empty, error and loading">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Inset>
            <EmptyState icon={<Inbox className="h-6 w-6" />} title="No watchlists yet" action={{ label: "Add a watchlist", onClick: noop }} />
          </Inset>
          <Inset>
            <EmptyState kind="filtered" title="No matches" description="Nothing fits these filters." action={{ label: "Clear filters", onClick: noop }} />
          </Inset>
          <Inset>
            <EmptyState kind="not-connected" title="No broker connected" description="Connect Alpaca to see positions." />
          </Inset>
          <Inset>
            <ErrorState title="Could not load your positions" onRetry={noop} traceId="7f3a19c2" />
          </Inset>
          <Inset className="lg:col-span-2">
            <LoadingRegion label="positions" busy>
              <div className="space-y-2">
                <Skeleton height="40px" />
                <Skeleton height="40px" />
                <Skeleton height="40px" />
              </div>
            </LoadingRegion>
          </Inset>
        </div>
      </Section>

      <Section title="Toasts">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast({ type: "success", message: "Paper buy filled: 10 AAPL at $189.20" })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Success
          </Button>
          <Button variant="secondary" onClick={() => toast({ type: "error", message: "Order rejected: insufficient buying power", traceId: "7f3a19c2" })}>
            Error
          </Button>
          <Button variant="secondary" onClick={() => toast({ type: "warning", message: "Quotes are 2 minutes old" })}>
            Warning
          </Button>
          <Button variant="secondary" onClick={() => toast({ type: "info", message: "Engine restarts at the open" })}>
            Info
          </Button>
        </div>
      </Section>
    </div>
  );
}
