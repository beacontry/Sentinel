/**
 * Tests for the swap-sell mode map added in PR 14 (Option 2 for the
 * optimized-vs-tactical-smart gap).
 *
 * Swap-sell defers cap-blocked STRONG_BUY candidates inside runScan, then
 * redeploys freed-slot capital after the in-loop exits fire. The behavior
 * itself runs inside runScan and needs a full engine setup to test; here
 * we just pin the per-mode defaults so accidental flips get caught.
 *
 *   - optimized: enabled (new — the point of PR 14's option C)
 *   - tactical-smart: disabled (has its own pair-wise swap-sell in
 *     runTacticalSmartScan; runScan path doesn't apply)
 *   - everything else: disabled
 */

import { describe, it, expect } from "vitest";
import { getSwapSellMode } from "@/lib/trading-engine";

describe("getSwapSellMode", () => {
  it("is enabled for optimized only by default", () => {
    expect(getSwapSellMode("optimized")).toBe("enabled");

    // tactical-smart has its own swap-sell elsewhere; runScan path opt-out
    expect(getSwapSellMode("tactical-smart")).toBe("disabled");

    // Other modes prefer the no-churn behavior
    expect(getSwapSellMode("conservative")).toBe("disabled");
    expect(getSwapSellMode("moderate")).toBe("disabled");
    expect(getSwapSellMode("aggressive")).toBe("disabled");
    expect(getSwapSellMode("tactical")).toBe("disabled");
    expect(getSwapSellMode("adaptive")).toBe("disabled");
  });
});
