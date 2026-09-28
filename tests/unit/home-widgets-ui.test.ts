/**
 * Dashboard home widgets (redesign plan, Stage 3c): each widget's states,
 * the header anatomy, and the widgets all on the shared load path.
 */

import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
}));

import { WidgetBody } from "@/components/dashboard/widgets/widget-body";
import { WidgetWrapper } from "@/components/dashboard/widget-wrapper";
import {
  initialWidgetLoad,
  widgetLoadFailed,
  widgetLoadStarted,
  widgetLoadSucceeded,
  type WidgetLoad,
} from "@/lib/widget-load";
import { WIDGET_REGISTRY } from "@/lib/widget-registry";

const noop = () => {};
const ROOT = join(__dirname, "..", "..");

function body(load: WidgetLoad<string[]>) {
  // WidgetBody holds no hooks, so it can be called directly; its children
  // prop is a render function.
  return renderToStaticMarkup(
    WidgetBody<string[]>({
      load: { ...load, retry: noop },
      label: "your watchlist",
      skeleton: createElement("p", null, "SKELETON"),
      isEmpty: (d: string[]) => d.length === 0,
      empty: createElement("p", null, "EMPTY"),
      children: (d: string[]): ReactNode => createElement("p", null, `ROWS:${d.join(",")}`),
    }) as ReactElement,
  );
}

describe("WidgetBody", () => {
  it("draws the skeleton and announces the load while the first read runs", () => {
    const html = body(initialWidgetLoad());
    expect(html).toContain("SKELETON");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading your watchlist");
  });

  it("says a failed first read failed, with a retry, and never shows the empty state", () => {
    const html = body(widgetLoadFailed(initialWidgetLoad<string[]>(), "Server error"));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load your watchlist");
    expect(html).toContain("Try again");
    expect(html).not.toContain("EMPTY");
  });

  it("names the plan, not a failure, for a 402", () => {
    const html = body(widgetLoadFailed(initialWidgetLoad<string[]>(), "x", true));
    expect(html).toContain("Not on your plan");
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).not.toContain('role="alert"');
  });

  it("shows the empty state only for a read that succeeded with nothing", () => {
    expect(body(widgetLoadSucceeded(initialWidgetLoad<string[]>(), [], 1))).toContain("EMPTY");
  });

  it("keeps the last rows under a stale notice when a later read fails", () => {
    const ok = widgetLoadSucceeded(initialWidgetLoad<string[]>(), ["AAPL"], Date.now() - 5 * 60_000);
    const html = body(widgetLoadFailed(widgetLoadStarted(ok), "Network error"));
    expect(html).toContain("ROWS:AAPL");
    expect(html).toContain("Refresh failing.");
    expect(html).toContain("5m ago");
    expect(html).not.toContain('role="alert"');
  });
});

describe("WidgetWrapper", () => {
  const props = { title: "Watchlist", description: "Last close", link: { href: "/dashboard/watchlists", label: "Watchlists" } };

  it("puts the page link in the header's right slot outside layout mode", () => {
    const html = renderToStaticMarkup(createElement(WidgetWrapper, { ...props, editMode: false }, "x"));
    expect(html).toContain('href="/dashboard/watchlists"');
    expect(html).toMatch(/<section aria-labelledby="[^"]+"/);
  });

  it("swaps the link for the edit controls in layout mode", () => {
    const html = renderToStaticMarkup(createElement(WidgetWrapper, { ...props, editMode: true, onRemove: noop }, "x"));
    expect(html).not.toContain('href="/dashboard/watchlists"');
    expect(html).toContain('aria-label="Remove Watchlist"');
  });

  it("gives every registered widget a page link", () => {
    for (const w of WIDGET_REGISTRY) expect(w.link?.href, w.id).toMatch(/^\/dashboard\//);
  });
});

describe("the dashboard widgets", () => {
  const dir = join(ROOT, "src/components/dashboard/widgets");
  const files = [
    "watchlist-widget", "market-overview-widget", "recent-signals-widget", "pnl-widget", "news-widget",
    "live-news-feed-widget", "positions-widget", "quick-insight-widget", "signal-feed-widget",
    "heatmap-mini-widget", "performance-widget", "earnings-widget", "portfolio-widget", "net-worth-widget",
    "pnl-heatmap-widget",
  ];

  it("each load through useWidgetLoad and render through WidgetBody", () => {
    for (const f of files) {
      const src = readFileSync(join(dir, `${f}.tsx`), "utf8");
      expect(src, f).toContain("useWidgetLoad");
      expect(src, f).toContain("<WidgetBody");
      expect(src, f).not.toMatch(/Unable to load/);
    }
  });

  it("no longer print money or change with a bare colour class and a hyphen", () => {
    for (const f of files) {
      const src = readFileSync(join(dir, `${f}.tsx`), "utf8");
      expect(src, f).not.toMatch(/\? "text-bullish" : "text-bearish"/);
      expect(src, f).not.toMatch(/text-white/);
    }
  });
});
