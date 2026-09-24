import { describe, it, expect } from "vitest";
import { parseUrlParam, replaceUrlParam, withUrlParam, type UrlParamWindow } from "@/lib/url-param";

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

/**
 * A window whose history behaves like Next's patched replaceState
 * (next/dist/client/components/app-router.js): a call whose data carries
 * `__NA` or `_N` is treated as Next's own and the router is not told;
 * anything else is copied onto Next's state and the router syncs.
 */
function nextLikeWindow(url: string) {
  const u = new URL(url, "http://localhost");
  const routerUrls: string[] = [];
  const win: UrlParamWindow & { history: { state: unknown } } = {
    location: { pathname: u.pathname, search: u.search, hash: u.hash },
    history: {
      state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [] },
      replaceState(data: unknown, _unused: string, next?: string | URL | null) {
        const d = data as { __NA?: unknown; _N?: unknown } | null;
        if (!(d?.__NA || d?._N) && next) routerUrls.push(String(next));
        if (next) {
          const n = new URL(String(next), "http://localhost");
          win.location = { pathname: n.pathname, search: n.search, hash: n.hash };
        }
      },
    },
  };
  return { win, routerUrls };
}

describe("replaceUrlParam", () => {
  it("tells the router about the new URL once Next has hydrated", () => {
    const { win, routerUrls } = nextLikeWindow("/dashboard/reports");
    replaceUrlParam(win, "tab", "signal", "overview");
    expect(win.location.search).toBe("?tab=signal");
    expect(routerUrls).toEqual(["/dashboard/reports?tab=signal"]);
  });

  it("does not pass Next's own history state", () => {
    const { win } = nextLikeWindow("/dashboard/reports");
    const seen: unknown[] = [];
    const inner = win.history.replaceState;
    win.history.replaceState = (data, unused, next) => {
      seen.push(data);
      inner(data, unused, next);
    };
    replaceUrlParam(win, "tab", "time", "overview");
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBe(win.history.state);
    expect((seen[0] as { __NA?: unknown }).__NA).toBeUndefined();
  });

  it("keeps a param set earlier in the same tick and the hash", () => {
    const { win, routerUrls } = nextLikeWindow("/dashboard/tax#lots");
    replaceUrlParam(win, "year", "2025", "2026");
    replaceUrlParam(win, "status", "mfj", "single");
    expect(routerUrls.at(-1)).toBe("/dashboard/tax?year=2025&status=mfj#lots");
  });

  it("drops the param when set back to the fallback", () => {
    const { win, routerUrls } = nextLikeWindow("/dashboard/reports?tab=symbol&x=1");
    replaceUrlParam(win, "tab", "overview", "overview");
    expect(routerUrls).toEqual(["/dashboard/reports?x=1"]);
  });
});
