/**
 * A dashboard widget's load (redesign plan, Stage 3c): one failed source
 * blanks one widget, a failure never reads as empty, and a failed poll
 * keeps the last good data marked stale instead of erasing it.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ageLabel,
  fetchWidgetJson,
  initialWidgetLoad,
  widgetErrorMessage,
  WidgetHttpError,
  widgetLoadFailed,
  widgetLoadStarted,
  widgetLoadSucceeded,
  widgetView,
} from "@/lib/widget-load";

describe("widget load states", () => {
  it("starts loading with nothing to show", () => {
    const s = initialWidgetLoad<number[]>();
    expect(widgetView(s)).toBe("loading");
    expect(s.data).toBeNull();
  });

  it("is an error, not an empty, when the first read fails", () => {
    const s = widgetLoadFailed(initialWidgetLoad<number[]>(), "Server error");
    expect(widgetView(s)).toBe("error");
    expect(s.data).toBeNull();
  });

  it("is ready after a read, even an empty one", () => {
    const s = widgetLoadSucceeded(initialWidgetLoad<number[]>(), [], 1000);
    expect(widgetView(s)).toBe("ready");
    expect(s.data).toEqual([]);
    expect(s.lastSuccessAt).toBe(1000);
  });

  it("keeps the last data and goes stale when a later read fails", () => {
    const ok = widgetLoadSucceeded(initialWidgetLoad<number[]>(), [1, 2], 1000);
    const failed = widgetLoadFailed(widgetLoadStarted(ok), "Network error");
    expect(widgetView(failed)).toBe("stale");
    expect(failed.data).toEqual([1, 2]);
    expect(failed.lastSuccessAt).toBe(1000);
    expect(failed.error).toBe("Network error");
  });

  it("does not drop loaded data back to a skeleton while a poll runs", () => {
    const ok = widgetLoadSucceeded(initialWidgetLoad<number[]>(), [1], 1000);
    const polling = widgetLoadStarted(ok);
    expect(widgetView(polling)).toBe("ready");
    expect(polling.pending).toBe(true);
  });

  it("goes back to loading on a retry after a first failure", () => {
    const failed = widgetLoadFailed(initialWidgetLoad<number[]>(), "x");
    const retry = widgetLoadStarted(failed);
    expect(widgetView(retry)).toBe("loading");
    expect(retry.error).toBeNull();
  });

  it("clears the stale mark once a read succeeds again", () => {
    const stale = widgetLoadFailed(widgetLoadSucceeded(initialWidgetLoad<number>(), 1, 1000), "x");
    const fresh = widgetLoadSucceeded(stale, 2, 2000);
    expect(widgetView(fresh)).toBe("ready");
    expect(fresh.error).toBeNull();
  });
});

describe("widgetErrorMessage", () => {
  it("names the kind of failure without the response body", () => {
    expect(widgetErrorMessage(new WidgetHttpError(500))).toBe("Server error");
    expect(widgetErrorMessage(new WidgetHttpError(402))).toBe("Not available on this plan");
    expect(widgetErrorMessage(new WidgetHttpError(403))).toBe("Not allowed");
    expect(widgetErrorMessage(new WidgetHttpError(429))).toBe("Rate limited");
    expect(widgetErrorMessage(new WidgetHttpError(404))).toBe("Request failed (404)");
    expect(widgetErrorMessage(new TypeError("fetch failed"))).toBe("Network error");
  });
});

describe("fetchWidgetJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws on a non-2xx instead of returning its body as data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ symbols: [] }), { status: 502 })));
    await expect(fetchWidgetJson("/api/watchlist")).rejects.toBeInstanceOf(WidgetHttpError);
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ symbols: ["AAPL"] }), { status: 200 })));
    await expect(fetchWidgetJson("/api/watchlist")).resolves.toEqual({ symbols: ["AAPL"] });
  });
});

describe("ageLabel", () => {
  it("reads in the largest whole unit", () => {
    expect(ageLabel(0, 30_000)).toBe("just now");
    expect(ageLabel(0, 4 * 60_000)).toBe("4m ago");
    expect(ageLabel(0, 3 * 3_600_000)).toBe("3h ago");
    expect(ageLabel(0, 2 * 86_400_000)).toBe("2d ago");
  });

  it("never prints a negative age for a clock that is slightly ahead", () => {
    expect(ageLabel(5_000, 0)).toBe("just now");
  });
});

describe("plan gate", () => {
  it("reads a first-load 402 as gated, not failed", () => {
    const s = widgetLoadFailed(initialWidgetLoad<number>(), "Not available on this plan", true);
    expect(widgetView(s)).toBe("gated");
  });

  it("keeps showing loaded data as stale if a later read is gated", () => {
    const ok = widgetLoadSucceeded(initialWidgetLoad<number>(), 1, 1000);
    expect(widgetView(widgetLoadFailed(ok, "x", true))).toBe("stale");
  });
});
