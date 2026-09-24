/**
 * WP10: pure view helpers behind the trader dashboard and the order ticket
 * (src/lib/trader-view.ts). There is no UI test harness, so the decisions the
 * pages render from live here.
 */

import { describe, it, expect } from "vitest";
import {
  applyEngineResponse,
  diffRiskProfile,
  emptyRiskForm,
  engineControls,
  hasLoaded,
  initialLoadState,
  lastKnownMode,
  loadFailed,
  loadStarted,
  loadSucceeded,
  mtmToggleBody,
  parseStatusMode,
  profileToRiskForm,
  riskFormToEngineParams,
  syncedPickerMode,
} from "@/lib/trader-view";

describe("applyEngineResponse (#30)", () => {
  it("unwraps the { data } envelope every engine route answers with", () => {
    const status = { running: true, halted: false, mode: "adaptive", environment: "live" };
    expect(applyEngineResponse({ data: status })).toEqual(status);
  });

  it("unwraps a command response that carries a message beside the status", () => {
    const out = applyEngineResponse<{ running: boolean; message: string }>({
      data: { message: "Trading engine started", running: true },
    });
    expect(out?.running).toBe(true);
  });

  it("accepts a bare status payload", () => {
    const status = { running: false, halted: true };
    expect(applyEngineResponse(status)).toEqual(status);
  });

  it("never returns the envelope itself, so running is never read off it", () => {
    expect(applyEngineResponse({ data: null })).toBeNull();
    expect(applyEngineResponse(null)).toBeNull();
    expect(applyEngineResponse("oops")).toBeNull();
  });
});

describe("engine mode picker (#31)", () => {
  it("follows the running engine's mode until the user touches it", () => {
    expect(syncedPickerMode("optimized", false, "adaptive")).toBe("adaptive");
    expect(syncedPickerMode("optimized", false, "conservative")).toBe("conservative");
  });

  it("keeps the user's pick once touched", () => {
    expect(syncedPickerMode("tactical", true, "adaptive")).toBe("tactical");
  });

  it("ignores a missing or unknown engine mode", () => {
    expect(syncedPickerMode("optimized", false, undefined)).toBe("optimized");
    expect(syncedPickerMode("optimized", false, "swing")).toBe("optimized");
  });

  it("offers Stop whenever the engine runs, with Switch only as an extra", () => {
    expect(engineControls({ running: true, mode: "adaptive" }, "optimized")).toEqual({
      start: false,
      stop: true,
      switchTo: true,
    });
    expect(engineControls({ running: true, mode: "adaptive" }, "adaptive")).toEqual({
      start: false,
      stop: true,
      switchTo: false,
    });
  });

  it("offers Start only when the engine is not running, including when its status is unknown", () => {
    expect(engineControls({ running: false, mode: "adaptive" }, "optimized")).toEqual({
      start: true,
      stop: false,
      switchTo: false,
    });
    expect(engineControls(null, "optimized").stop).toBe(false);
  });
});

describe("resume mode for the engine-offline banner (#31)", () => {
  it("parses the persisted env:mode heartbeat", () => {
    expect(parseStatusMode("paper:adaptive")).toBe("adaptive");
    expect(parseStatusMode("live:tactical-smart")).toBe("tactical-smart");
    expect(parseStatusMode("paper")).toBeNull();
    expect(parseStatusMode("unknown")).toBeNull();
    expect(parseStatusMode(null)).toBeNull();
  });

  it("prefers the persisted mode, then the engine's, then the picker", () => {
    expect(lastKnownMode("live:adaptive", "optimized", "optimized")).toBe("adaptive");
    expect(lastKnownMode("paper", "tactical", "optimized")).toBe("tactical");
    expect(lastKnownMode("unknown", undefined, "tactical-smart")).toBe("tactical-smart");
  });
});

describe("load state transitions (#32, #33, #36)", () => {
  it("starts loading and not loaded", () => {
    const s = initialLoadState();
    expect(s).toEqual({ status: "loading", lastSuccessAt: null, error: null });
    expect(hasLoaded(s)).toBe(false);
  });

  it("a first-load failure is an error with nothing loaded", () => {
    const s = loadFailed(initialLoadState(), "boom");
    expect(s).toEqual({ status: "error", lastSuccessAt: null, error: "boom" });
    expect(hasLoaded(s)).toBe(false);
  });

  it("a failure after a success keeps lastSuccessAt, so the last data stays usable but marked", () => {
    const ok = loadSucceeded(initialLoadState(), 1_000);
    const failed = loadFailed(ok, "500");
    expect(failed).toEqual({ status: "error", lastSuccessAt: 1_000, error: "500" });
    expect(hasLoaded(failed)).toBe(true);
    expect(loadFailed(failed, "500")).not.toBe(failed);
  });

  it("a retry shows loading only when nothing was loaded yet", () => {
    expect(loadStarted(loadFailed(initialLoadState(), "x")).status).toBe("loading");
    const stale = loadFailed(loadSucceeded(initialLoadState(), 1), "x");
    expect(loadStarted(stale)).toBe(stale);
  });

  it("a success clears the error", () => {
    const s = loadSucceeded(loadFailed(initialLoadState(), "x"), 5);
    expect(s).toEqual({ status: "ready", lastSuccessAt: 5, error: null });
  });
});

describe("risk overrides form (#32)", () => {
  const stored = {
    accountSize: 25_000,
    maxDailyLossPct: 1.5,
    maxDrawdownPct: 8,
    maxPositionPct: 10,
    maxPositionSize: null,
    maxSingleTradeLoss: null,
    maxExposureMultiplier: 1,
    trailActivationProfitPct: 0.05,
    trailActivationBars: null,
    maxSectorExposurePct: 30,
    earningsBlackoutDays: 5,
  };

  it("maps the stored profile to form strings, with the trail gate as a percent", () => {
    const form = profileToRiskForm(stored);
    expect(form.maxDailyLossPct).toBe("1.5");
    expect(form.trailActivationProfitPct).toBe("5");
    expect(form.maxPositionSize).toBe("");
    expect(profileToRiskForm(null)).toEqual(emptyRiskForm());
  });

  it("sends only the field the user changed, never nulls for untouched loss caps", () => {
    const loaded = profileToRiskForm(stored);
    const form = { ...loaded, maxPositionSize: "50" };
    expect(diffRiskProfile(loaded, form)).toEqual({ maxPositionSize: 50 });
  });

  it("after a failed load (blank snapshot) an edit still sends only that field", () => {
    const blank = emptyRiskForm();
    const form = { ...blank, maxPositionSize: "50" };
    const payload = diffRiskProfile(blank, form);
    expect(payload).toEqual({ maxPositionSize: 50 });
    expect(Object.values(payload)).not.toContain(null);
  });

  it("an unchanged form sends nothing", () => {
    const loaded = profileToRiskForm(stored);
    expect(diffRiskProfile(loaded, { ...loaded })).toEqual({});
  });

  it("a field the user cleared becomes null (engine decides)", () => {
    const loaded = profileToRiskForm(stored);
    expect(diffRiskProfile(loaded, { ...loaded, maxDailyLossPct: "" })).toEqual({ maxDailyLossPct: null });
  });

  it("scales the trail gate back to a fraction and ignores whitespace-only changes", () => {
    const loaded = profileToRiskForm(stored);
    expect(diffRiskProfile(loaded, { ...loaded, trailActivationProfitPct: "7.5" })).toEqual({
      trailActivationProfitPct: 0.075,
    });
    expect(diffRiskProfile(loaded, { ...loaded, maxDrawdownPct: " 8 " })).toEqual({});
  });

  it("pushes only set overrides to the live engine", () => {
    const params = riskFormToEngineParams(profileToRiskForm(stored));
    expect(params).not.toHaveProperty("maxPositionSize");
    expect(params.trailActivationProfitPct).toBeCloseTo(0.05);
    expect(params.maxDailyLossPct).toBe(1.5);
  });
});

describe("MTM checkbox PUT body (#36)", () => {
  it("never sends notes", () => {
    expect(mtmToggleBody(true, { mtmElectionYear: null }, 2026)).not.toHaveProperty("notes");
    expect(mtmToggleBody(false, { mtmElectionYear: 2024 }, 2026)).not.toHaveProperty("notes");
  });

  it("re-asserting keeps a prior election year by omitting it", () => {
    expect(mtmToggleBody(true, { mtmElectionYear: 2024 }, 2026)).toEqual({ hasTraderTaxStatus: true });
  });

  it("a first election records the current year; unticking clears it", () => {
    expect(mtmToggleBody(true, { mtmElectionYear: null }, 2026)).toEqual({
      hasTraderTaxStatus: true,
      mtmElectionYear: 2026,
    });
    expect(mtmToggleBody(false, { mtmElectionYear: 2024 }, 2026)).toEqual({
      hasTraderTaxStatus: false,
      mtmElectionYear: null,
    });
  });
});
