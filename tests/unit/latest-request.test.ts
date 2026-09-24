import { describe, it, expect } from "vitest";
import { createLatestRequest } from "@/lib/latest-request";

// A request whose response the test resolves by hand, so it can make the
// older one land last.
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createLatestRequest", () => {
  it("a fresh ticket is current and not aborted", () => {
    const req = createLatestRequest();
    const t = req.begin();
    expect(t.isCurrent()).toBe(true);
    expect(t.signal.aborted).toBe(false);
  });

  it("begin() supersedes and aborts the previous request", () => {
    const req = createLatestRequest();
    const a = req.begin();
    const b = req.begin();
    expect(a.isCurrent()).toBe(false);
    expect(a.signal.aborted).toBe(true);
    expect(b.isCurrent()).toBe(true);
    expect(b.signal.aborted).toBe(false);
  });

  it("cancel() invalidates and aborts the current request", () => {
    const req = createLatestRequest();
    const a = req.begin();
    req.cancel();
    expect(a.isCurrent()).toBe(false);
    expect(a.signal.aborted).toBe(true);
    // A new request after a cancel is current again.
    expect(req.begin().isCurrent()).toBe(true);
  });

  it("drops the stale response when the older request lands last", async () => {
    const req = createLatestRequest();
    const shown: string[] = [];
    const responses = { AAPL: deferred<string>(), TSLA: deferred<string>() };

    async function open(symbol: "AAPL" | "TSLA") {
      const ticket = req.begin();
      const data = await responses[symbol].promise;
      if (!ticket.isCurrent()) return;
      shown.push(data);
    }

    const first = open("AAPL");
    const second = open("TSLA");
    responses.TSLA.resolve("TSLA analysis");
    await second;
    responses.AAPL.resolve("AAPL analysis");
    await first;

    expect(shown).toEqual(["TSLA analysis"]);
  });

  it("drops a response that lands after cancel (modal closed)", async () => {
    const req = createLatestRequest();
    const shown: string[] = [];
    const res = deferred<string>();

    const pending = (async () => {
      const ticket = req.begin();
      const data = await res.promise;
      if (ticket.isCurrent()) shown.push(data);
    })();

    req.cancel();
    res.resolve("late");
    await pending;
    expect(shown).toEqual([]);
  });

  it("aborts a superseded fetch on the wire", async () => {
    const req = createLatestRequest();
    const a = req.begin();
    const aborted = new Promise<string>((resolve) =>
      a.signal.addEventListener("abort", () => resolve(String(a.signal.reason?.name ?? "aborted")))
    );
    req.begin();
    await expect(aborted).resolves.toBeTruthy();
  });
});
