/**
 * Input, Select, Textarea and SearchInput share one field treatment
 * (redesign plan, Stage 2).
 *
 * - One fill (bg-secondary) and the 3:1 control edge for every field.
 *   The Select trigger and the Textarea sat on bg-elevated.
 * - 16px text below `sm`, so iOS does not zoom the page on focus.
 * - 44px tall.
 * - An error marks the field aria-invalid and points aria-describedby
 *   at the error line, so a screen reader hears why when it lands on the
 *   field, not only the red edge a sighted user sees.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search-input";

const noop = () => {};
const options = [{ value: "buy", label: "Buy" }];

function tagClasses(html: string, tag: string): string[] {
  const m = new RegExp(`<${tag}\\b[^>]*class="([^"]*)"`).exec(html);
  if (!m) throw new Error(`no <${tag}> in ${html}`);
  return m[1].split(/\s+/).filter(Boolean);
}

const FIELDS: [string, string, string][] = [
  ["Input", renderToStaticMarkup(createElement(Input, { label: "Quantity" })), "input"],
  ["Select", renderToStaticMarkup(createElement(Select, { label: "Side", options })), "button"],
  ["Textarea", renderToStaticMarkup(createElement(Textarea, { label: "Notes" })), "textarea"],
  ["SearchInput", renderToStaticMarkup(createElement(SearchInput, { onSearch: noop })), "input"],
];

describe.each(FIELDS)("%s", (_name, html, tag) => {
  const classes = tagClasses(html, tag);

  it("sits on the card fill with the 3:1 control edge", () => {
    expect(classes).toContain("bg-bg-secondary");
    expect(classes).not.toContain("bg-bg-elevated");
    expect(classes).toContain("border-border-control");
  });

  it("is 16px below sm so iOS does not zoom on focus", () => {
    expect(classes).toContain("text-base");
    expect(classes).toContain("sm:text-sm");
  });

  it("does not mark itself invalid without an error", () => {
    expect(html).not.toContain("aria-invalid");
  });
});

describe.each(["Input", "Select", "Textarea"])("%s with an error", (name) => {
  const html =
    name === "Input"
      ? renderToStaticMarkup(createElement(Input, { label: "Quantity", error: "Enter a whole number" }))
      : name === "Select"
        ? renderToStaticMarkup(createElement(Select, { label: "Side", options, error: "Enter a whole number" }))
        : renderToStaticMarkup(createElement(Textarea, { label: "Notes", error: "Enter a whole number" }));

  it("is aria-invalid and described by its error line", () => {
    expect(html).toContain('aria-invalid="true"');
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<p id="${id}"[^>]*>Enter a whole number</p>`));
  });

  it("turns its edge to the loss line", () => {
    const tag = name === "Select" ? "button" : name.toLowerCase();
    expect(tagClasses(html, tag)).toContain("border-bearish-line");
  });
});

describe("Input without a label or id", () => {
  it("still gets an id, so an error can be linked to it", () => {
    const html = renderToStaticMarkup(createElement(Input, { error: "Required" }));
    const id = /<input[^>]*\bid="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`aria-describedby="${id}-error"`);
  });
});

describe("SearchInput clear button", () => {
  it("is a 44px target with a label", () => {
    const html = renderToStaticMarkup(createElement(SearchInput, { onSearch: noop, value: "AAPL" }));
    expect(html).toMatch(/<button\b[^>]*aria-label="Clear search"/);
    const classes = tagClasses(html.slice(html.indexOf("<button")), "button");
    expect(classes).toContain("h-11");
    expect(classes).toContain("w-11");
  });
});
