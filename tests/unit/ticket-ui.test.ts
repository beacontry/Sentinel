/**
 * The order ticket's redesign (plan Stage 3b), read from source because
 * the page needs the router, toasts and live fetches to render. The rules
 * behind it (labels, reasons, estimate, body) are tested as functions in
 * order-ticket.test.ts; this pins how the page and its pieces use them.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "src");
// Normalised to LF so a CRLF checkout matches the multi-line patterns.
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const page = read("app", "dashboard", "trade", "[symbol]", "page.tsx");
const form = read("components", "trade-ticket", "order-form.tsx");
const summary = read("components", "trade-ticket", "order-summary.tsx");
const header = read("components", "trade-ticket", "ticket-header.tsx");
const strip = read("components", "trader", "environment-strip.tsx");

describe("order ticket", () => {
  it("picks the side with a Segmented control whose options print a word and a glyph", () => {
    expect(form).toContain('label="Order side"');
    expect(form).toContain('{ value: "buy", label: "Buy", icon: "▲", tone: "bullish" }');
    expect(form).toContain('{ value: "sell", label: "Sell", icon: "▼", tone: "bearish" }');
  });

  it("still drops the bracket when switching to sell or to dollars", () => {
    expect(form).toContain('v === "sell" ? { side: v, useBracket: false } : { side: v }');
    expect(form).toContain('v === "dollars" ? { sizingMode: v, useBracket: false } : { sizingMode: v }');
  });

  it("names the account and the side on the submit button", () => {
    expect(summary).toContain("{submitLabel(p.side, p.account)}");
  });

  it("prints why the submit is disabled, except while it loads", () => {
    expect(summary).toContain("disabledReason={p.reading ? undefined : blockedReason(p.engine, p.account)}");
  });

  it("keeps submit off unless the engine is stopped and the account is known", () => {
    expect(summary).toContain(
      'p.reading || p.submitting || p.engine !== "stopped" || (p.account !== "paper" && p.account !== "live")',
    );
  });

  it("confirms a LIVE order with the solid danger fill", () => {
    expect(page).toMatch(/confirmLabel: `Place LIVE \$\{fields\.side\}`,\s*tone: "irreversible",/);
  });

  it("opens the decimal keypad for every money and quantity field", () => {
    expect(form).toMatch(/const priceProps = \{\s*type: "number",\s*inputMode: "decimal",/);
    const inputs = form.match(/<Input\b/g)?.length ?? 0;
    const spread = form.match(/\{\.\.\.priceProps\}/g)?.length ?? 0;
    expect(inputs).toBeGreaterThan(0);
    expect(spread).toBe(inputs);
  });

  it("opens with the desk's environment strip, in words", () => {
    expect(page).toContain("<EnvironmentStrip");
    expect(strip).toContain("LIVE, real money");
    expect(strip).toContain("Paper account");
    expect(strip).toContain("Account type unknown");
  });

  it("keeps an unreadable account apart from no broker at all", () => {
    expect(page).toMatch(/ctx\.connectionFailed\s*\?\s*"unknown"\s*:\s*"none"/);
    expect(page).toContain('kind="not-connected"');
  });

  it("says a price is unavailable, never $0, and marks an old one", () => {
    expect(header).toContain("Price unavailable");
    expect(header).toContain("QUOTE_STALE_MS");
    expect(summary).toContain('"Price unavailable"');
  });
});
