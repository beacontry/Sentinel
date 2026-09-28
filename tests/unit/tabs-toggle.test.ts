/**
 * Tabs and Toggle (redesign plan, Stage 2).
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";

const noop = () => {};

describe("Tabs", () => {
  const html = renderToStaticMarkup(
    createElement(Tabs, { tabs: [{ id: "a", label: "Overview" }, { id: "b", label: "Signals" }], activeTab: "a", onChange: noop }),
  );

  it("keeps the global focus outline on its triggers", () => {
    expect(html).not.toMatch(/\boutline-none\b/);
  });

  it("gives each trigger a 44px target", () => {
    expect(html.match(/min-h-11/g)).toHaveLength(2);
  });

  it("marks the active tab selected", () => {
    expect(html).toMatch(/aria-selected="true"[^>]*>Overview</);
  });
});

describe("TabPanel", () => {
  it("renders the active panel as a visible tabpanel", () => {
    const html = renderToStaticMarkup(createElement(TabPanel, { active: true }, "content"));
    expect(html).toMatch(/^<div role="tabpanel"/);
    expect(html).not.toContain("hidden");
  });

  it("does not mount a panel that has never been shown", () => {
    expect(renderToStaticMarkup(createElement(TabPanel, { active: false }, "content"))).toBe("");
  });
});

describe("Toggle", () => {
  const html = renderToStaticMarkup(createElement(Toggle, { label: "Colour-blind mode", checked: true }));

  it("fills with the accent when on and labels the thumb with on-accent", () => {
    expect(html).toContain("peer-checked:bg-accent");
    expect(html).toContain("peer-checked:bg-on-accent");
    expect(html).not.toMatch(/bg-accent\/\d/);
  });

  it("draws its track edge with the 3:1 control token", () => {
    expect(html).toContain("border-border-control");
  });

  it("gives the whole label a 44px target", () => {
    expect(html).toMatch(/<label[^>]*class="[^"]*min-h-11/);
  });

  it("shows keyboard focus as an outline on the track, which forced colours keep", () => {
    expect(html).toContain("peer-focus-visible:outline-2");
    expect(html).not.toContain("ring-offset");
  });
});
