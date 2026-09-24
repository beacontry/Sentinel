/**
 * The order ticket's redesign (plan Stage 3b), read from source because
 * the page needs the router, toasts and live fetches to render.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "..", "..", "src", "app", "dashboard", "trade", "[symbol]", "page.tsx"), "utf8");

describe("order ticket", () => {
  it("picks the side with a Segmented control whose options print a word and a glyph", () => {
    expect(src).toContain('label="Order side"');
    expect(src).toContain('{ value: "buy", label: "Buy", icon: "▲", tone: "bullish" }');
    expect(src).toContain('{ value: "sell", label: "Sell", icon: "▼", tone: "bearish" }');
  });

  it("still drops the bracket when switching to sell or to dollars", () => {
    expect(src).toMatch(/if \(v === "sell"\) setUseBracket\(false\);/);
    expect(src).toMatch(/if \(v === "dollars"\) setUseBracket\(false\);/);
  });

  it("names the account and the side on the submit button", () => {
    expect(src).toContain("Place {envWord} {side}");
    expect(src).toContain('const envWord = isLive ? "LIVE" : "paper";');
  });

  it("prints why the submit is disabled", () => {
    expect(src).toContain('"Engine is running, stop it first on the Trader page."');
    expect(src).toContain('"Engine status unknown. Retry below."');
    expect(src).toContain("disabledReason={loadingContext ? undefined : blockedReason}");
  });

  it("keeps submit off while the context loads, as the hidden form used to", () => {
    expect(src).toMatch(/disabled=\{loadingContext \|\| engineBlocked \|\| engineUnknown \|\| submitting \|\| !connection\}/);
  });

  it("confirms a LIVE order with the solid danger fill", () => {
    expect(src).toMatch(/confirmLabel: `Place LIVE \$\{side\}`,\s*tone: "irreversible",/);
  });

  it("opens the decimal keypad for every money and quantity field", () => {
    const numberFields = src.match(/type="number"/g)?.length ?? 0;
    const decimal = src.match(/inputMode="decimal"/g)?.length ?? 0;
    expect(numberFields).toBeGreaterThan(0);
    expect(decimal).toBe(numberFields);
  });

  it("shows the environment as a chip in the header", () => {
    expect(src).toContain('"LIVE, real money"');
    expect(src).toContain('"Paper account"');
  });
});
