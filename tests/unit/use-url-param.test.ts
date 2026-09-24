import { describe, it, expect } from "vitest";
import { parseUrlParam, withUrlParam } from "@/lib/url-param";

const TABS = ["overview", "signal", "time", "symbol"] as const;

describe("parseUrlParam", () => {
  it("returns the fallback when the param is absent", () => {
    expect(parseUrlParam(null, "overview", TABS)).toBe("overview");
  });

  it("returns an allowed value", () => {
    expect(parseUrlParam("time", "overview", TABS)).toBe("time");
  });

  it("falls back on a value outside the allowed list", () => {
    expect(parseUrlParam("bogus", "overview", TABS)).toBe("overview");
    expect(parseUrlParam("", "overview", TABS)).toBe("overview");
    // Case matters: the tab ids are exact.
    expect(parseUrlParam("Time", "overview", TABS)).toBe("overview");
  });

  it("accepts a predicate for open-ended values", () => {
    const isIncome = (raw: string) => /^\d{1,10}$/.test(raw);
    expect(parseUrlParam("85000", "50000", isIncome)).toBe("85000");
    expect(parseUrlParam("0", "50000", isIncome)).toBe("0");
    expect(parseUrlParam("-5", "50000", isIncome)).toBe("50000");
    expect(parseUrlParam("1e9", "50000", isIncome)).toBe("50000");
    expect(parseUrlParam("", "50000", isIncome)).toBe("50000");
  });
});

describe("withUrlParam", () => {
  it("sets a param and keeps the others", () => {
    expect(withUrlParam("?year=2025", "tab", "scheduled", "form8949")).toBe(
      "?year=2025&tab=scheduled",
    );
  });

  it("replaces an existing value", () => {
    expect(withUrlParam("?tab=time&x=1", "tab", "symbol", "overview")).toBe("?tab=symbol&x=1");
  });

  it("removes the param when set back to the fallback", () => {
    expect(withUrlParam("?tab=time&year=2025", "tab", "overview", "overview")).toBe("?year=2025");
    expect(withUrlParam("?tab=time", "tab", "overview", "overview")).toBe("");
  });

  it("works from an empty query string and encodes values", () => {
    expect(withUrlParam("", "q", "a b&c", "")).toBe("?q=a+b%26c");
  });
});
