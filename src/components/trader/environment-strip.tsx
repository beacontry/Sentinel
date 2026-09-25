import { AlertTriangle, FlaskConical, HelpCircle, Plug, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusChip } from "@/components/ui/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { brokerName, type BrokerContext } from "./broker-context";

/**
 * Which account the desk is acting on, above everything else on the page.
 * Always rendered, in words and an icon: "Paper account" or "LIVE, real
 * money" (warning tone), "No broker connected", or "Account type unknown"
 * when the connection could not be read. Colour is never the only carrier.
 *
 * While the engine is running against a live account the strip also says
 * so, with the last four digits of the account it booted on. That used to
 * be a separate red banner that repeated the LIVE chip beside it.
 */

interface EnvironmentStripProps {
  broker: BrokerContext;
  /** The engine is running against a live account; the tail is its account number's last 4. */
  engineLive?: { accountTail: string | null } | null;
  onRetry: () => void;
}

const BAR = "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-1.5 text-sm";

export function EnvironmentStrip({ broker, engineLive, onRetry }: EnvironmentStripProps) {
  if (broker.status === "loading") {
    return (
      <div className={`${BAR} border-border bg-bg-secondary`} aria-hidden="true">
        <Skeleton className="h-5 w-28" rounded="full" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </div>
    );
  }

  if (broker.status === "error") {
    return (
      <section aria-label="Trading account" className={`${BAR} border-warning-line bg-warning-fill`}>
        <StatusChip tone="warning" icon={<HelpCircle className="h-3 w-3" />}>
          Account type unknown
        </StatusChip>
        <span className="min-w-48 flex-1 text-text-secondary">
          Could not read your broker connection, so this page cannot say whether it is paper or live.
        </span>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </Button>
      </section>
    );
  }

  if (broker.status === "none") {
    return (
      <section aria-label="Trading account" className={`${BAR} border-border bg-bg-secondary`}>
        <StatusChip icon={<Plug className="h-3 w-3" />}>No broker connected</StatusChip>
        <span className="min-w-48 flex-1 text-text-secondary">Connect a paper or live account to trade from this desk.</span>
        <ButtonLink href="/dashboard/settings" variant="secondary" size="sm">
          Connect a broker
        </ButtonLink>
      </section>
    );
  }

  const name = [brokerName(broker.broker), broker.label].filter(Boolean).join(" · ");

  if (broker.environment === "live") {
    return (
      <section aria-label="Trading account" className={`${BAR} border-warning-line bg-warning-fill`}>
        <StatusChip tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>
          LIVE, real money
        </StatusChip>
        <span className="min-w-48 flex-1 text-text-primary">
          <span className="font-medium">{name}</span>
          <span className="text-text-secondary">
            {engineLive
              ? ". The engine is placing orders with real funds now."
              : ". Orders from this desk use real funds."}
          </span>
        </span>
        {engineLive?.accountTail && (
          <span className="font-mono text-xs text-text-secondary">acct ••••{engineLive.accountTail}</span>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Trading account" className={`${BAR} border-border bg-bg-secondary`}>
      <StatusChip tone="accent" icon={<FlaskConical className="h-3 w-3" />}>
        Paper account
      </StatusChip>
      <span className="min-w-48 flex-1 text-text-secondary">
        <span className="font-medium text-text-primary">{name}</span>. Simulated orders, no real money.
      </span>
    </section>
  );
}
