/**
 * The trader desk's page-level pieces (redesign plan, Stage 3a): the
 * environment strip, the freshness line, the engine panel, the alert and
 * halt panels, the tax election and the risk overrides. Rendering only;
 * the page owns fetching and commands.
 */

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/trader",
}));

import { activeBrokerFrom } from "@/components/trader/broker-context";
import { EnvironmentStrip } from "@/components/trader/environment-strip";
import { RefreshFailingNotice, TraderFreshness } from "@/components/trader/trader-freshness";
import { EngineControls, modeOptionsFor } from "@/components/trader/engine-controls";
import { DeskPanel } from "@/components/trader/desk-panel";
import { HaltPanel } from "@/components/trader/halt-panel";
import { TaxElectionPanel } from "@/components/trader/tax-status-toggle";
import { RiskOverridesPanel, RISK_FIELDS } from "@/components/trader/risk-override-form";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EngineStatus } from "@/components/trader/types";
import { emptyRiskForm, initialLoadState, type LoadState } from "@/lib/trader-view";

const noop = () => {};
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("activeBrokerFrom", () => {
  it("reads the active connection's environment", () => {
    expect(
      activeBrokerFrom({ connections: [{ broker: "alpaca", environment: "live", isActive: true, label: "Main" }] }),
    ).toEqual({ status: "ready", environment: "live", broker: "alpaca", label: "Main" });
  });

  it("says none when no connection is active, and error for an unreadable body", () => {
    expect(activeBrokerFrom({ connections: [{ broker: "alpaca", environment: "paper", isActive: false }] })).toEqual({ status: "none" });
    expect(activeBrokerFrom({ error: "x" })).toEqual({ status: "error" });
    expect(activeBrokerFrom(null)).toEqual({ status: "error" });
  });

  it("never guesses an environment it was not told", () => {
    expect(activeBrokerFrom({ connections: [{ broker: "alpaca", environment: "sandbox", isActive: true }] })).toEqual({ status: "error" });
  });

  it("drops a label that only restates the environment", () => {
    for (const label of ["Default", "Paper account", "live", "  "]) {
      const b = activeBrokerFrom({ connections: [{ broker: "alpaca", environment: "paper", isActive: true, label }] });
      expect(b.status === "ready" && b.label).toBe(null);
    }
  });
});

describe("EnvironmentStrip", () => {
  it("names a paper account in words and an icon", () => {
    const out = html(
      createElement(EnvironmentStrip, { broker: { status: "ready", environment: "paper", broker: "alpaca", label: null }, onRetry: noop }),
    );
    expect(out).toContain("Paper account");
    expect(out).toContain("Alpaca");
    expect(out).toMatch(/<span aria-hidden="true"[^>]*><svg/);
  });

  it("marks a live account as real money in the warning tone", () => {
    const out = html(
      createElement(EnvironmentStrip, {
        broker: { status: "ready", environment: "live", broker: "alpaca", label: null },
        engineLive: { accountTail: "1234" },
        onRetry: noop,
      }),
    );
    expect(out).toContain("LIVE, real money");
    expect(out).toContain("border-warning-line");
    expect(out).toContain("placing orders with real funds now");
    expect(out).toContain("••••1234");
  });

  it("says unknown, not paper, when the connection could not be read", () => {
    const out = html(createElement(EnvironmentStrip, { broker: { status: "error" }, onRetry: noop }));
    expect(out).toContain("Account type unknown");
    expect(out).not.toContain("Paper account");
    expect(out).toContain("Retry");
  });

  it("offers to connect when there is no broker", () => {
    const out = html(createElement(EnvironmentStrip, { broker: { status: "none" }, onRetry: noop }));
    expect(out).toContain("No broker connected");
    expect(out).toContain('href="/dashboard/settings"');
  });
});

describe("TraderFreshness", () => {
  const ready: LoadState = { status: "ready", lastSuccessAt: Date.now(), error: null };

  it("says the broker is online and how old the figures are", () => {
    const out = html(createElement(TraderFreshness, { load: ready, connected: true, intervalMs: 10_000 }));
    expect(out).toContain("Broker online");
    expect(out).toMatch(/Updated \d+s ago/);
  });

  it("keeps a mounted status line whose words change only with the state", () => {
    const out = html(createElement(TraderFreshness, { load: ready, connected: true, intervalMs: 10_000 }));
    expect(out).toMatch(/<p class="sr-only" role="status">Broker online, figures current.<\/p>/);
    // The ticking age is hidden from the status line.
    expect(out).toMatch(/<div aria-hidden="true"[^>]*>.*Updated/);
  });

  it("says a refresh is failing and how old the data is", () => {
    const failing: LoadState = { status: "error", lastSuccessAt: Date.now() - 5_000, error: "Dashboard: HTTP 502" };
    const out = html(createElement(TraderFreshness, { load: failing, connected: true, intervalMs: 10_000 }));
    expect(out).toContain("Refresh failing");
    expect(out).toMatch(/Last updated \d+s ago/);
    expect(out).toContain("Dashboard: HTTP 502");
  });

  it("puts the failing source and a retry under the header, and nothing while healthy", () => {
    const failing: LoadState = { status: "error", lastSuccessAt: Date.now() - 5_000, error: "Dashboard: HTTP 502" };
    const out = html(createElement(RefreshFailingNotice, { load: failing, onRetry: noop }));
    expect(out).toContain("Showing the last good read");
    expect(out).toContain("(Dashboard: HTTP 502)");
    expect(out).toContain("Retry now");
    expect(out).not.toContain('role="alert"');
    expect(html(createElement(RefreshFailingNotice, { load: ready, onRetry: noop }))).toBe("");
  });

  it("stops claiming online once the data is older than two polls", () => {
    const stale: LoadState = { status: "error", lastSuccessAt: Date.now() - 60_000, error: "Dashboard: network error" };
    const out = html(createElement(TraderFreshness, { load: stale, connected: true, intervalMs: 10_000 }));
    expect(out).toContain("Connection unknown");
    expect(out).not.toContain("Broker online");
  });
});

describe("EngineControls", () => {
  const stopped: EngineStatus = {
    running: false,
    halted: false,
    mode: "optimized",
    lastScanAt: null,
    scanCount: 0,
    positionCount: 0,
    dailyLoss: 0,
    errors: [],
  };
  const props = {
    engine: stopped,
    pickerMode: "optimized",
    onPickMode: noop,
    controls: { start: true, stop: false, switchTo: false },
    pending: null,
    canStart: true,
    lastHeartbeat: null,
    tradingHalted: false,
    onStart: noop,
    onSwitch: noop,
    onStop: noop,
    onHalt: noop,
  };

  it("picks the mode on a Segmented control seeded with the picker mode", () => {
    const out = html(createElement(EngineControls, props));
    expect(out).toContain('role="group" aria-label="Engine mode"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>Optimized<\/button>/);
    expect(out).toContain("grid-cols-2");
  });

  it("prints every command as a word, not an icon alone", () => {
    const out = html(createElement(EngineControls, props));
    expect(out).toMatch(/Start<\/button>/);
    expect(out).toMatch(/Halt<\/button>/);
  });

  it("keeps Stop and Switch as separate actions while running", () => {
    const out = html(
      createElement(EngineControls, {
        ...props,
        engine: { ...stopped, running: true },
        pickerMode: "tactical",
        controls: { start: false, stop: true, switchTo: true },
      }),
    );
    expect(out).toContain("Switch to Tactical");
    expect(out).toMatch(/Stop<\/button>/);
    expect(out).toContain("Running, Optimized");
  });

  it("says the status is unknown when the engine could not be read", () => {
    expect(html(createElement(EngineControls, { ...props, engine: null }))).toContain("Status unknown");
  });

  it("still shows a running legacy mode as the chosen one", () => {
    expect(modeOptionsFor("moderate").map((m) => m.value)).toContain("moderate");
    expect(modeOptionsFor("optimized").map((m) => m.value)).not.toContain("moderate");
  });
});

describe("DeskPanel", () => {
  it("labels the section by its heading and keeps controls from being pushed off", () => {
    const out = html(createElement(DeskPanel, { id: "p", title: "Open positions", count: 3, controls: "x" }, "body"));
    expect(out).toMatch(/^<section id="p" aria-labelledby="p-heading"/);
    expect(out).toContain('<h2 id="p-heading"');
    expect(out).toContain("min-w-0");
    expect(out).toContain("shrink-0");
  });
});

describe("HaltPanel", () => {
  const positions = [
    { symbol: "AAPL", quantity: 10, entryPrice: 200, currentPrice: 190, unrealizedPnl: -100, stopPrice: 180 },
    { symbol: "MSFT", quantity: 5, entryPrice: 400, currentPrice: 410, unrealizedPnl: 50, stopPrice: null },
  ];
  const base = { realizedPnl: -20, unrealizedPnl: -50, totalPnl: -70, tradesCount: 1, halted: true };

  it("does not claim a liquidation after a safeguard halt", () => {
    const out = html(
      createElement(HaltPanel, { todayPnl: { ...base, haltReason: "daily_loss" }, positions, flattening: false, onFlattenAll: noop }),
    );
    expect(out).toContain("does not flatten");
    expect(out).not.toContain("submitted market sells");
  });

  it("lists only the losers, with signed figures", () => {
    const out = html(
      createElement(HaltPanel, { todayPnl: { ...base, haltReason: "user_emergency_halt" }, positions, flattening: false, onFlattenAll: noop }),
    );
    expect(out).toContain("Worst bleeding (1 of 1)");
    expect(out).toContain("−5.00%");
    expect(out).toContain("−$100.00");
  });
});

describe("TaxElectionPanel", () => {
  it("keeps the switch disabled and busy until the election has loaded", () => {
    const out = html(
      createElement(TaxElectionPanel, {
        taxStatus: null,
        load: initialLoadState(),
        saving: false,
        onToggle: noop,
        onRetry: noop,
        washSaleOn: undefined,
        washSaleBlockedCount: 0,
      }),
    );
    expect(out).toMatch(/<input type="checkbox" id="trader-mtm-election"[^>]*disabled=""/);
    expect(out).toContain('aria-busy="true"');
    // An unread engine status is not "Off".
    expect(out).toContain("Unknown");
  });
});

describe("RiskOverridesPanel", () => {
  const props = {
    open: false,
    onToggleOpen: noop,
    form: emptyRiskForm(),
    onField: noop,
    load: { status: "ready", lastSuccessAt: 1, error: null } as LoadState,
    onRetry: noop,
    saving: false,
    saved: false,
    saveError: null,
    canSave: false,
    onSave: noop,
  };

  // The field help renders through Tooltip, which needs its provider.
  const risk = (p: typeof props) => html(createElement(TooltipProvider, null, createElement(RiskOverridesPanel, p)));

  it("folds away behind a labelled, stateful toggle", () => {
    const out = risk(props);
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-controls="trader-risk-fields"');
    expect(out).toMatch(/<div id="trader-risk-fields" hidden=""/);
    expect(out).toContain(">Edit");
  });

  it("counts the overrides that are set", () => {
    const out = risk({ ...props, form: { ...emptyRiskForm(), maxDailyLossPct: "2" } });
    expect(out).toContain(`1 of ${RISK_FIELDS.length} set`);
  });

  it("keeps a mounted status line for the save result", () => {
    expect(risk({ ...props, open: true })).toMatch(/<p role="status"/);
  });
});
