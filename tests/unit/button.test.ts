/**
 * The Button primitive (redesign plan, Stage 2).
 *
 * - Every size has a 44px touch target: md is min-h-11, sm draws 36px and
 *   pads its hit area with a pseudo-element.
 * - No transition-all, and hover only on an enabled button.
 * - A busy button is disabled, says aria-busy and keeps its label.
 * - A disabled button can print why, joined with aria-describedby.
 * - The solid danger fill exists for the one irreversible confirm; the
 *   everyday destructive button uses the bearish triplet.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, BUTTON_VARIANTS, BUTTON_SIZES } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";

function render(props: Record<string, unknown>, label = "Place order"): string {
  return renderToStaticMarkup(createElement(Button, props, label));
}

function buttonClassList(html: string): string[] {
  const m = /<button\b[^>]*class="([^"]*)"/.exec(html);
  if (!m) throw new Error(`no button in ${html}`);
  return m[1].split(/\s+/);
}

describe("Button sizes", () => {
  it("is 44px tall by default", () => {
    expect(buttonClassList(render({}))).toContain("min-h-11");
  });

  it("keeps the deprecated lg size at the md height", () => {
    expect(BUTTON_SIZES.lg).toBe(BUTTON_SIZES.md);
  });

  it("pads the 36px sm button's hit area out to 44px", () => {
    const classes = buttonClassList(render({ size: "sm" }));
    expect(classes).toContain("min-h-9");
    expect(classes).toContain("relative");
    expect(classes).toContain("before:-inset-1");
  });
});

describe("Button styling", () => {
  it("names what it transitions", () => {
    for (const v of Object.keys(BUTTON_VARIANTS)) {
      const classes = buttonClassList(render({ variant: v }));
      expect(classes).not.toContain("transition-all");
      expect(classes.some((c) => c.startsWith("transition-["))).toBe(true);
    }
  });

  it("only changes colour on hover while enabled", () => {
    for (const [v, cls] of Object.entries(BUTTON_VARIANTS)) {
      const bareHover = cls.split(/\s+/).filter((c) => c.startsWith("hover:"));
      expect(bareHover, v).toEqual([]);
    }
  });

  it("labels the accent fill with on-accent", () => {
    expect(BUTTON_VARIANTS.primary).toContain("bg-accent");
    expect(BUTTON_VARIANTS.primary).toContain("text-on-accent");
  });

  it("keeps the solid loss fill for danger only", () => {
    expect(BUTTON_VARIANTS.danger).toContain("bg-bearish-solid");
    expect(BUTTON_VARIANTS.danger).toContain("text-on-bearish");
    expect(BUTTON_VARIANTS.destructive).toContain("bg-bearish-fill");
    expect(BUTTON_VARIANTS.destructive).toContain("text-bearish-fg");
    expect(BUTTON_VARIANTS.destructive).not.toContain("bearish-solid");
  });

  it("renders the deprecated outline variant as secondary", () => {
    expect(BUTTON_VARIANTS.outline).toBe(BUTTON_VARIANTS.secondary);
  });

  it("gives control edges the 3:1 border token", () => {
    expect(BUTTON_VARIANTS.secondary).toContain("border-border-control");
  });
});

describe("Button states", () => {
  it("marks a loading button busy and disabled, and keeps its label", () => {
    const html = render({ loading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain("Place order");
  });

  it("does not set aria-busy at rest", () => {
    expect(render({})).not.toContain("aria-busy=");
  });

  it("prints the reason a disabled button cannot be used, and links it", () => {
    const html = render({ disabled: true, disabledReason: "Engine is running, stop it first" });
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain("Engine is running, stop it first");
  });

  it("does not print a reason while the button is enabled", () => {
    const html = render({ disabledReason: "Engine is running, stop it first" });
    expect(html).not.toContain("Engine is running");
    expect(html).not.toContain("aria-describedby");
  });

  it("keeps a caller's aria-describedby alongside the reason", () => {
    const html = render({ disabled: true, disabledReason: "Why", "aria-describedby": "hint" });
    expect(/aria-describedby="hint [^"]+"/.test(html)).toBe(true);
  });

  it("has no default type, so a Button in a form still submits it", () => {
    expect(render({})).not.toMatch(/<button[^>]*type=/);
  });
});

describe("ButtonLink", () => {
  it("is a single anchor with the button classes, not a button in a link", () => {
    const html = renderToStaticMarkup(createElement(ButtonLink, { href: "/dashboard/trader" }, "Open trader"));
    expect(html).toMatch(/^<a\b/);
    expect(html).not.toContain("<button");
    expect(html).toContain("min-h-11");
    expect(html).toContain("text-on-accent");
    expect(html).toContain("hover:bg-accent-hover");
  });
});
