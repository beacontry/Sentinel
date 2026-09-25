/**
 * EmptyState and ErrorState (redesign plan, Stage 2): empty, filtered,
 * not connected and failed are four different things and read that way.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

const noop = () => {};

describe("EmptyState", () => {
  it("renders a link, not a button, for an href action", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, { title: "No watchlists yet", action: { label: "Add a watchlist", href: "/dashboard/watchlists?new=1" } }),
    );
    expect(html).toContain('href="/dashboard/watchlists?new=1"');
    expect(html).not.toContain("<button");
  });

  it("renders a button for an onClick action", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, { kind: "filtered", title: "No matches", action: { label: "Clear filters", onClick: noop } }),
    );
    expect(html).toContain("<button");
    expect(html).toContain("Clear filters");
  });

  it("points a not-connected state at Settings when no action is given", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, { kind: "not-connected", title: "No broker connected" }));
    expect(html).toContain('href="/dashboard/settings"');
    expect(html).toContain("Connect a broker");
  });

  it("offers nothing by default for a genuine empty", () => {
    const html = renderToStaticMarkup(createElement(EmptyState, { title: "No trades yet" }));
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
  });

  it("uses the heading level it is given", () => {
    expect(renderToStaticMarkup(createElement(EmptyState, { title: "t", headingLevel: 2 }))).toContain("<h2");
  });

  it("is not an alert", () => {
    expect(renderToStaticMarkup(createElement(EmptyState, { title: "t" }))).not.toContain('role="alert"');
  });
});

describe("ErrorState", () => {
  it("announces as an alert, with a retry and the trace reference", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorState, { title: "Could not load your positions", onRetry: noop, traceId: "7f3a-19" }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load your positions");
    expect(html).toContain("Try again");
    expect(html).toContain("Reference: 7f3a-19");
  });

  it("keeps the retry label while it is retrying", () => {
    const html = renderToStaticMarkup(createElement(ErrorState, { title: "x", onRetry: noop, retrying: true }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Try again");
  });

  it("shows no reference line without a trace id", () => {
    expect(renderToStaticMarkup(createElement(ErrorState, { title: "x" }))).not.toContain("Reference");
  });
});
