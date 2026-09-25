/**
 * Order and trade statuses as words, tones and icons (redesign plan,
 * Stage 2), and the chips that print them without leaning on colour.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { orderStatusMeta } from "@/lib/order-status";
import { tradeStatusTone } from "@/lib/status-tone";
import { OrderStatusChip, StatusChip } from "@/components/ui/status-chip";
import { SignalBadge } from "@/components/ui/signal-badge";
import { SignedValue, signedValueCh } from "@/components/ui/signed-value";
import { Badge } from "@/components/ui/badge";

describe("orderStatusMeta", () => {
  it.each([
    ["new", "New", "neutral", "clock"],
    ["accepted", "Accepted", "neutral", "clock"],
    ["pending_new", "Pending", "neutral", "clock"],
    ["partially_filled", "Partially filled", "warning", "half"],
    ["PARTIAL_FILLED", "Partially filled", "warning", "half"],
    ["filled", "Filled", "bullish", "check"],
    ["FILLED", "Filled", "bullish", "check"],
    ["canceled", "Canceled", "neutral", "ban"],
    ["expired", "Expired", "neutral", "clock"],
    ["rejected", "Rejected", "bearish", "cross"],
    ["FAILED", "Failed", "bearish", "cross"],
    ["replaced", "Replaced", "neutral", "replace"],
  ])("%s → %s, %s, %s", (status, label, tone, icon) => {
    expect(orderStatusMeta(status)).toEqual({ label, tone, icon });
  });

  it("keeps an unknown status's own text, neutral", () => {
    expect(orderStatusMeta("held_for_review")).toEqual({ label: "held_for_review", tone: "neutral", icon: "dot" });
  });

  it("says Unknown for a missing status rather than printing nothing", () => {
    expect(orderStatusMeta(null).label).toBe("Unknown");
    expect(orderStatusMeta("").label).toBe("Unknown");
  });

  it("takes every tone from the one status map", () => {
    for (const s of ["new", "filled", "rejected", "partially_filled", "canceled", "whatever", "FAILED"]) {
      expect(orderStatusMeta(s).tone).toBe(tradeStatusTone(s));
    }
  });
});

describe("OrderStatusChip", () => {
  it("prints the word, a hidden icon and the triplet", () => {
    const html = renderToStaticMarkup(createElement(OrderStatusChip, { status: "rejected" }));
    expect(html).toContain("Rejected");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("text-bearish-fg");
    expect(html).toContain("<svg");
  });
});

describe("StatusChip", () => {
  it("renders its icon hidden from screen readers, and its words", () => {
    const html = renderToStaticMarkup(createElement(StatusChip, { tone: "bullish", icon: "▲" }, "Gain"));
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>▲<\/span>Gain/);
    expect(html).toContain("border-bullish-line");
  });
});

describe("SignalBadge", () => {
  it.each([
    ["BUY", "▲", "Buy"],
    ["STRONG_BUY", "▲", "Strong Buy"],
    ["SELL", "▼", "Sell"],
    ["STRONG_SELL", "▼", "Strong Sell"],
  ] as const)("%s carries %s beside the word", (signal, glyph, word) => {
    const html = renderToStaticMarkup(createElement(SignalBadge, { signal }));
    expect(html).toContain(glyph);
    expect(html).toContain(word);
    expect(html).toContain("text-xs");
  });

  it("gives Hold no direction glyph", () => {
    const html = renderToStaticMarkup(createElement(SignalBadge, { signal: "HOLD" }));
    expect(html).not.toMatch(/[▲▼]/);
  });
});

describe("Badge", () => {
  it("shares the chip shape and maps default to the neutral tone", () => {
    const html = renderToStaticMarkup(createElement(Badge, null, "Paper"));
    expect(html).toContain("rounded-full");
    expect(html).toContain("text-text-secondary");
  });
});

describe("SignedValue", () => {
  const render = (value: number | null, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(SignedValue, { value, ...extra }));

  it("prints a gain with ▲, a plus, and the word for screen readers", () => {
    const html = render(12.5);
    expect(html).toContain("▲");
    expect(html).toContain("+$12.50");
    expect(html).toContain('<span class="sr-only">gain</span>');
    expect(html).toContain("text-bullish");
  });

  it("prints a loss with ▼ and the U+2212 minus", () => {
    const html = render(-3.1);
    expect(html).toContain("▼");
    expect(html).toContain("−$3.10");
    expect(html).toContain('<span class="sr-only">loss</span>');
    expect(html).toContain("text-bearish");
  });

  it("does not colour a value that prints as zero", () => {
    const html = render(-0.004);
    expect(html).toContain("$0.00");
    expect(html).not.toContain("text-bearish");
    expect(html).not.toContain("sr-only");
  });

  it("prints an unknown as n/a, not zero", () => {
    const html = render(null);
    expect(html).toContain("n/a");
    expect(html).not.toContain("$0.00");
  });

  it("uses tabular monospace figures", () => {
    expect(render(1)).toContain("font-mono tabular-nums");
  });

  it("shows the percent when it has a basis and is asked for one", () => {
    const text = render(-12.5, { basis: 1000, format: "both" }).replace(/<[^>]+>/g, "");
    expect(text).toContain("−$12.50 (−1.25%)");
  });

  it("keeps the glyph, sign and figure in one unbreakable group, the percent in another", () => {
    // A narrow container may break only between the two groups: never
    // mid-number, and never between the sign and its digits.
    const html = render(-123456.7, { basis: 1234567, format: "both" });
    expect(html).toMatch(/<span class="[^"]*whitespace-nowrap[^"]*"><span aria-hidden="true"[^>]*>▼<\/span><span>−\$123,456\.70<\/span><\/span>/);
    expect(html).toContain('<span class="whitespace-nowrap"> (−10.00%)</span>');
    expect(html).not.toContain("wrap-anywhere");
  });
});

describe("signedValueCh", () => {
  it("measures the widest unbreakable line: glyph and figure, or the percent", () => {
    expect(signedValueCh(-123456.7)).toBe("−$123,456.70".length + 1.75);
    expect(signedValueCh(-123456.7, 1234567, "both", false)).toBe("−$123,456.70".length);
    expect(signedValueCh(0.05, 1, "both", false)).toBe("(+5.00%)".length);
    expect(signedValueCh(null)).toBe(3);
  });
});
