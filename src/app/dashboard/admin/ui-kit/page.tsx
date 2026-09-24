"use client";

// The primitive gallery (redesign plan, Stage 2 verification): every
// primitive in every state on one page, for screenshots in each theme and
// for a keyboard pass. Static sample data only; nothing here reads or
// writes an account. Admin-only, like the rest of /dashboard/admin, and
// not linked from the nav.

import { useState } from "react";
import { Inbox, Plus, Search } from "lucide-react";
import { useTier } from "@/components/tiers/tier-gate";
import { PageIntro } from "@/components/layout/page-intro";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardHeader, CardTitle, Inset } from "@/components/ui/card";
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

export default function UiKitPage() {
  const { role, loading } = useTier();
  const { toast } = useToast();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [tab, setTab] = useState("one");
  const [on, setOn] = useState(true);
  const [select, setSelect] = useState("day");

  if (loading) return <div className="p-4 lg:p-6"><Skeleton height="200px" /></div>;
  if (role !== "admin") {
    return (
      <div className="p-4 lg:p-6">
        <EmptyState title="Admins only" description="The primitive gallery is an admin tool." />
      </div>
    );
  }

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
