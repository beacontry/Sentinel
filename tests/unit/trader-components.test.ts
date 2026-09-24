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
import { DeskReadout } from "@/components/trader/account-readout";
import { RecentTrades } from "@/components/trader/recent-activity";
import { ToastProvider } from "@/components/ui/toast";
import type { TraderOpenOrder, TraderPosition, TraderTrade } from "@/components/trader/types";

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

describe("DeskReadout", () => {
  const account = { equity: 10000, cash: -500, buyingPower: 8000, portfolioValue: 10500, longMarketValue: 10500 };
  const lifetime = { realizedPnl: 100, realizedPnlToday: 0, unrealizedPnl: 0, totalPnl: 100 };

  it("is one bordered readout, not a card per figure", () => {
    const html = renderToStaticMarkup(
      createElement(DeskReadout, { account, todayPnl: null, lifetimePnl: lifetime, pnlFormat: "dollar" }),
    );
    expect(html.match(/border-border/g)).toHaveLength(1);
    expect(html).toContain("on margin");
  });

  it("leads with total equity at display size", () => {
    const html = renderToStaticMarkup(
      createElement(DeskReadout, { account, todayPnl: null, lifetimePnl: lifetime, pnlFormat: "dollar" }),
    );
    expect(html).toMatch(/Total equity<\/dt><dd class="[^"]*text-2xl[^"]*">\$10,000.00</);
  });

  it("keeps tile figures on one line and sizes them to the tile", () => {
    const html = renderToStaticMarkup(
      createElement(DeskReadout, { account, todayPnl: null, lifetimePnl: lifetime, pnlFormat: "dollar" }),
    );
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("@min-[11.5rem]:text-xl");
  });

  it("shows percents only against a real basis", () => {
    const withBasis = renderToStaticMarkup(
      createElement(DeskReadout, { account: { ...account, equity: 1000 }, todayPnl: null, lifetimePnl: lifetime, pnlFormat: "both" }),
    );
    expect(withBasis).toContain("+$100.00 (+10.00%)");
    const noBasis = renderToStaticMarkup(
      createElement(DeskReadout, { account: null, todayPnl: null, lifetimePnl: lifetime, pnlFormat: "both" }),
    );
    expect(noBasis).not.toContain("%");
  });

  it("says the balances are unavailable rather than hiding them", () => {
    const html = renderToStaticMarkup(
      createElement(DeskReadout, { account: null, todayPnl: null, lifetimePnl: lifetime, pnlFormat: "dollar" }),
    );
    expect(html).toContain("Balances unavailable");
  });
});

describe("RecentTrades", () => {
  const trades: TraderTrade[] = [
    { id: "t1", symbol: "PEP", action: "SELL", signal: "SELL", quantity: 40, orderType: "market", fillPrice: 170, status: "filled", pnl: -274.4, traderTimestamp: new Date().toISOString() },
    { id: "t2", symbol: "CAT", action: "BUY", signal: "BUY", quantity: 8, orderType: "limit", fillPrice: null, status: "pending_new", pnl: null, traderTimestamp: new Date().toISOString() },
  ];
  // The post-mortem button raises toasts, so it needs the provider.
  const html = renderToStaticMarkup(
    createElement(
      ToastProvider,
      null,
      createElement(RecentTrades, { trades, pnlFormat: "dollar", summarizing: new Set<string>(), summaries: {}, onSummarize: noop }),
    ),
  );

  it("lines rows up in one column grid from md, two rows on a phone", () => {
    expect(html).toContain("md:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_7.5rem_14rem]");
    expect(html.match(/md:contents/g)?.length).toBe(4);
  });

  it("says a trade without realized P&L has none, rather than leaving a gap", () => {
    expect(html).toContain('<span class="sr-only">No realized P&amp;L</span>');
    expect(html).toContain("−$274.40");
  });
});
