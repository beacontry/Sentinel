/**
 * The Watchlists page pieces (redesign plan, Stage 3c): the symbols table
 * and card list, and the lists panel's states.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SymbolsTable } from "@/components/watchlists/symbols-table";
import { ListsPanel, type WatchlistSummary } from "@/components/watchlists/lists-panel";

const noop = () => {};

describe("SymbolsTable", () => {
  const html = renderToStaticMarkup(
    createElement(SymbolsTable, {
      symbols: ["AAPL", "TSLA", "NVDA"],
      quotes: { AAPL: { price: 1228.4, change: 1.5 }, TSLA: null },
      onRemove: noop,
    }),
  );

  it("renders a table from md up and a row list below it", () => {
    expect(html).toMatch(/<table class="hidden w-full text-sm md:table"/);
    expect(html).toMatch(/<ul class="[^"]*md:hidden/);
  });

  it("prints a grouped price and a signed change that reads without colour", () => {
    expect(html).toContain("$1,228.40");
    expect(html).toContain("+1.50%");
    expect(html).toContain('<span class="sr-only">gain</span>');
  });

  it("says Unavailable for a failed quote and draws a skeleton only while one is pending", () => {
    expect(html).toContain("Unavailable");
    expect(html).toContain('aria-hidden="true" class="bg-bg-elevated');
  });

  it("names each Remove after its symbol and puts no button inside a link", () => {
    expect(html).toContain('aria-label="Remove TSLA"');
    expect(html).not.toMatch(/<a [^>]*>[^<]*<button/);
  });
});

describe("ListsPanel", () => {
  const lists: WatchlistSummary[] = [
    { id: "a", name: "Core tech", isDefault: true, createdAt: "", itemCount: 8 },
    { id: "b", name: "Energy", isDefault: false, createdAt: "", itemCount: 1 },
  ];
  const create = { open: false, name: "", submitting: false, onOpen: noop, onCancel: noop, onName: noop, onSubmit: noop };
  const render = (status: "loading" | "error" | "ready", l = lists) =>
    renderToStaticMarkup(
      createElement(ListsPanel, {
        status,
        lists: l,
        activeId: "a",
        maxLists: 20,
        onSelect: noop,
        onMakeDefault: noop,
        onDelete: noop,
        onRetry: noop,
        create,
      }),
    );

  it("marks the selected list with aria-pressed, not colour alone", () => {
    const html = render("ready");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("1 symbol<");
  });

  it("offers Make default only on lists that are not the default", () => {
    const html = render("ready");
    expect(html).toContain('aria-label="Make Energy the default"');
    expect(html).not.toContain('aria-label="Make Core tech the default"');
  });

  it("tells a failed load apart from no lists", () => {
    expect(render("error")).toContain("Could not load your watchlists");
    expect(render("error")).not.toContain("No watchlists yet");
    expect(render("ready", [])).toContain("No watchlists yet");
  });

  it("offers one create action when there are no lists, not two", () => {
    const html = render("ready", []);
    expect(html).toContain("Create a watchlist");
    expect(html).not.toContain("New list");
  });
});
