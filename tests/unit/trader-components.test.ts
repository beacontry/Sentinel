/**
 * The pieces the trader page is split into (redesign plan, Stage 3a).
 * Rendering only: the page keeps fetching, commands and confirmations.
 */

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/trader",
}));

import { PositionsTable } from "@/components/trader/positions-table";
import { OpenOrdersTable } from "@/components/trader/open-orders-table";
import { AccountReadout, PnlReadout } from "@/components/trader/account-readout";
import type { TraderOpenOrder, TraderPosition } from "@/components/trader/types";

const noop = () => {};
const positions: TraderPosition[] = [
  { symbol: "AAPL", quantity: 10, entryPrice: 180, currentPrice: 190, unrealizedPnl: 100, stopPrice: 170 },
  { symbol: "TSLA", quantity: 5, entryPrice: 250, currentPrice: 240, unrealizedPnl: -50, stopPrice: null },
];

describe("PositionsTable", () => {
  const html = renderToStaticMarkup(
    createElement(PositionsTable, { positions, pnlFormat: "dollar", busy: false, onOpen: noop, onClose: noop }),
  );

  it("renders a table from md up and a card list below it", () => {
    expect(html).toMatch(/<div class="hidden overflow-x-auto md:block">\s*<table/);
    expect(html).toMatch(/<ul class="[^"]*md:hidden/);
  });

  it("keeps the table header in view and the figures tabular", () => {
    expect(html).toMatch(/<thead class="sticky top-0/);
    expect(html).toContain("tabular-nums");
  });

  it("prints each P&L with its direction, not colour alone", () => {
    expect(html).toContain("+$100.00");
    expect(html).toContain("−$50.00");
    expect(html).toContain('<span class="sr-only">gain</span>');
    expect(html).toContain('<span class="sr-only">loss</span>');
  });

  it("names each Close button after its symbol", () => {
    expect(html).toContain('aria-label="Close AAPL"');
    expect(html).toContain('aria-label="Close TSLA"');
  });

  it("disables Close while a command is in flight", () => {
    const busy = renderToStaticMarkup(
      createElement(PositionsTable, { positions, pnlFormat: "dollar", busy: true, onOpen: noop, onClose: noop }),
    );
    expect((busy.match(/aria-label="Close AAPL"/g) ?? []).length).toBe(2);
    expect(busy.match(/disabled=""[^>]*aria-label="Close|aria-label="Close[^>]*disabled=""/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it("says so when there is nothing open", () => {
    expect(
      renderToStaticMarkup(createElement(PositionsTable, { positions: [], pnlFormat: "dollar", busy: false, onOpen: noop, onClose: noop })),
    ).toContain("No open positions");
  });
});

describe("OpenOrdersTable", () => {
  const orders: TraderOpenOrder[] = [
    { id: "1", symbol: "AAPL", side: "sell", type: "stop", qty: 10, filledQty: 0, status: "accepted", stopPrice: "170", limitPrice: null, timeInForce: "gtc", submittedAt: new Date().toISOString() },
    { id: "2", symbol: "MSFT", side: "buy", type: "limit", qty: 4, filledQty: 1, status: "partially_filled", stopPrice: null, limitPrice: "400", timeInForce: "day", submittedAt: new Date().toISOString() },
  ];
  const html = renderToStaticMarkup(createElement(OpenOrdersTable, { orders }));

  it("prints the side as a word with a glyph", () => {
    expect(html).toMatch(/▼ <\/span>SELL/);
    expect(html).toMatch(/▲ <\/span>BUY/);
  });

  it("prints statuses through the one status map, with a partial fill spelled out", () => {
    expect(html).toContain("Accepted");
    expect(html).toContain("Partial 1/4");
    expect(html).toContain("text-warning-fg");
  });
});

describe("Account and P&L readouts", () => {
  it("is one bordered strip of tiles, not a card per figure", () => {
    const html = renderToStaticMarkup(
      createElement(AccountReadout, { account: { equity: 10000, cash: -500, buyingPower: 8000, portfolioValue: 10500, longMarketValue: 10500 } }),
    );
    expect(html.match(/border-border/g)).toHaveLength(1);
    expect(html).toContain("on margin");
  });

  it("shows percents only against a real basis", () => {
    const withBasis = renderToStaticMarkup(
      createElement(PnlReadout, { todayPnl: null, lifetimePnl: { realizedPnl: 100, realizedPnlToday: 0, unrealizedPnl: 0, totalPnl: 100 }, basis: 1000, pnlFormat: "both" }),
    );
    expect(withBasis).toContain("+$100.00 (+10.00%)");
    const noBasis = renderToStaticMarkup(
      createElement(PnlReadout, { todayPnl: null, lifetimePnl: { realizedPnl: 100, realizedPnlToday: 0, unrealizedPnl: 0, totalPnl: 100 }, basis: undefined, pnlFormat: "both" }),
    );
    expect(noBasis).not.toContain("%");
  });
});
