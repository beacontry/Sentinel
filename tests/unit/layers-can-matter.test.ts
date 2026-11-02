/**
 * layersCanMatter (2026-11-02) — the per-symbol gate that decides whether the
 * scan spends Finnhub budget on the hybrid layers. The layers only re-grade
 * BUY↔STRONG_BUY↔HOLD and SELL↔STRONG_SELL↔HOLD, so they can change an outcome
 * only for a held symbol or for one a BUY could actually reach this scan.
 */

import { describe, it, expect } from "vitest";
import { layersCanMatter, type LayerGateFacts } from "@/lib/trading-engine";

const open: LayerGateFacts = {
  held: false,
  marketHealthy: true,
  halted: false,
  cooldownActive: false,
  reentryBlocked: false,
  pendingBuy: false,
  heldCount: 3,
  hardCap: 15,
  swapMode: "disabled",
};

describe("layersCanMatter", () => {
  it("runs for a buyable symbol in a healthy market", () => {
    expect(layersCanMatter(open)).toBe(true);
  });

  it("always runs for a held symbol, whatever else is true", () => {
    expect(layersCanMatter({ ...open, held: true, marketHealthy: false, halted: true, cooldownActive: true, reentryBlocked: true, heldCount: 99 })).toBe(true);
  });

  it("skips when the market is unhealthy and the symbol is not held (every BUY is refused)", () => {
    expect(layersCanMatter({ ...open, marketHealthy: false })).toBe(false);
  });

  it("skips when the engine is halted", () => {
    expect(layersCanMatter({ ...open, halted: true })).toBe(false);
  });

  it("skips on cooldown, re-entry block, or a pending buy", () => {
    expect(layersCanMatter({ ...open, cooldownActive: true })).toBe(false);
    expect(layersCanMatter({ ...open, reentryBlocked: true })).toBe(false);
    expect(layersCanMatter({ ...open, pendingBuy: true })).toBe(false);
  });

  it("skips at the hard cap when swap-sell is off, runs when swap-sell could still buy post-loop", () => {
    expect(layersCanMatter({ ...open, heldCount: 15, hardCap: 15, swapMode: "disabled" })).toBe(false);
    expect(layersCanMatter({ ...open, heldCount: 15, hardCap: 15, swapMode: "enabled" })).toBe(true);
    expect(layersCanMatter({ ...open, heldCount: 14, hardCap: 15, swapMode: "disabled" })).toBe(true);
  });
});
