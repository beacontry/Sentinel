/**
 * WP10: pure view helpers behind the trader dashboard and the order ticket
 * (src/lib/trader-view.ts). There is no UI test harness, so the decisions the
 * pages render from live here.
 */

import { describe, it, expect } from "vitest";
import {
  applyEngineResponse,
  engineControls,
  lastKnownMode,
  parseStatusMode,
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
