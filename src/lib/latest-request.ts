/**
 * Latest-request guard for client fetches that can be superseded.
 *
 * A page that fetches on a click or an input change can have two requests
 * in flight, and the slower one lands last. Without a guard its response
 * (and its finally block) overwrites the state the newer request is
 * about to fill: one symbol's analysis under another's title, a tax
 * estimate for an income the field no longer shows.
 *
 * Usage:
 *
 *   const req = createLatestRequest();       // once per component (see useLatestRequest)
 *   const ticket = req.begin();              // aborts the previous request
 *   const res = await fetch(url, { signal: ticket.signal });
 *   if (!ticket.isCurrent()) return;         // superseded or cancelled: touch nothing
 *   setData(...);
 *
 * Check isCurrent() before every state write, including in catch and
 * finally. An aborted fetch rejects with an AbortError, and that rejection
 * belongs to a request nobody is waiting for any more.
 */

export interface RequestTicket {
  /** Pass to fetch so a superseded request is cancelled on the wire too. */
  readonly signal: AbortSignal;
  /** True while this is the newest request and it has not been cancelled. */
  isCurrent(): boolean;
}

export interface LatestRequest {
  /** Start a new request. Aborts and invalidates the previous one. */
  begin(): RequestTicket;
  /** Abort and invalidate the current request without starting another. */
  cancel(): void;
}

export function createLatestRequest(): LatestRequest {
  let generation = 0;
  let controller: AbortController | null = null;

  function cancel() {
    generation += 1;
    controller?.abort();
    controller = null;
  }

  function begin(): RequestTicket {
    cancel();
    const mine = generation;
    const own = new AbortController();
    controller = own;
    return {
      signal: own.signal,
      isCurrent: () => mine === generation && !own.signal.aborted,
    };
  }

  return { begin, cancel };
}
