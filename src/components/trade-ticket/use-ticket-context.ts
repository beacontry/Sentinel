"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchQuotes, type QuoteView } from "@/lib/quotes-client";
import { heldQtyFrom } from "@/lib/order-ticket";
import type { TicketQuote } from "./ticket-header";

/**
 * Everything the ticket reads: the engine's status, the active broker
 * connection, buying power, the holding in this symbol and its price.
 * Every read is a GET; nothing here sends an order.
 *
 * Each value has its own unknown. An engine status that could not be read
 * is null (unknown, never "stopped"); a connections read that failed sets
 * `connectionFailed` (unknown, never "no broker"); buying power and the
 * holding are null when the account read failed; a price that could not be
 * read is `quoteState: "unavailable"`, never $0.
 */

export interface EngineStatus {
  running: boolean;
  environment: "paper" | "live" | null;
}

export interface ConnectionMeta {
  id: string;
  broker: string;
  label: string;
  environment: "paper" | "live";
  isActive: boolean;
}

/** The active connection from a /api/broker/connections response, or null. */
export function activeConnectionFrom(d: { connections?: ConnectionMeta[] }): ConnectionMeta | null {
  return (d.connections ?? []).find((c) => c.isActive) ?? null;
}

// Buying power from a /api/broker/account body ({ account: {...}, positions }).
function buyingPowerFrom(d: { account?: { buyingPower?: unknown } }): number | null {
  const bp = d.account?.buyingPower;
  return typeof bp === "number" && Number.isFinite(bp) ? bp : null;
}

export function useTicketContext(symbol: string) {
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [buyingPower, setBuyingPower] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [connection, setConnection] = useState<ConnectionMeta | null>(null);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [quote, setQuote] = useState<TicketQuote | null>(null);
  const [quoteState, setQuoteState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [refreshingQuote, setRefreshingQuote] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);
  // The first load has finished; until then the page draws its skeleton.
  const [loaded, setLoaded] = useState(false);

  const applyQuote = useCallback((q: QuoteView | null) => {
    if (q) {
      setQuote({ price: q.price, changePct: q.change, fetchedAt: Date.now() });
      setQuoteState("ready");
    } else {
      // Drop any earlier price so the estimate never uses a stale one.
      setQuote(null);
      setQuoteState("unavailable");
    }
  }, []);

  const applyAccount = useCallback(
    (d: { account?: { buyingPower?: unknown } } | null) => {
      setBuyingPower(d ? buyingPowerFrom(d) : null);
      setHeld(d ? heldQtyFrom(d, symbol) : null);
    },
    [symbol],
  );

  // Loaded on mount and again whenever the active broker connection changes.
  // The generation counter drops a load that a newer one or an unmount
  // superseded.
  const contextGenRef = useRef(0);
  const loadContext = useCallback(async () => {
    const gen = ++contextGenRef.current;
    let engineRead = false;
    let connectionRead = false;
    try {
      // The quote comes from the read-only /api/quotes. fetchQuotes never
      // rejects: a failed read is a null quote, not a failed context load.
      const [engineRes, accountRes, connectionsRes, quotes] = await Promise.all([
        fetch("/api/trader/engine"),
        fetch("/api/broker/account"),
        fetch("/api/broker/connections"),
        fetchQuotes([symbol]),
      ]);
      if (gen !== contextGenRef.current) return;
      if (engineRes.ok) {
        const d = await engineRes.json();
        setEngineStatus({
          running: d.data?.running === true,
          environment: d.data?.environment ?? null,
        });
        engineRead = true;
      } else {
        // Unknown, not stopped: the ticket must not claim the engine is
        // stopped when its status could not be read.
        setEngineStatus(null);
      }
      // A failed read shows "Unavailable", not the previous account's figures.
      applyAccount(accountRes.ok ? await accountRes.json() : null);
      if (connectionsRes.ok) {
        setConnection(activeConnectionFrom(await connectionsRes.json()));
        setConnectionFailed(false);
        connectionRead = true;
      } else {
        setConnectionFailed(true);
      }
      applyQuote(quotes[symbol] ?? null);
    } catch {
      // Fields can still be filled in manually, but a failed read leaves the
      // engine state and the account unknown rather than a default.
      if (gen === contextGenRef.current) {
        if (!engineRead) setEngineStatus(null);
        if (!connectionRead) setConnectionFailed(true);
        setQuoteState((s) => (s === "loading" ? "unavailable" : s));
      }
    } finally {
      if (gen === contextGenRef.current) {
        setLoadingContext(false);
        setLoaded(true);
      }
    }
  }, [symbol, applyAccount, applyQuote]);

  useEffect(() => {
    void loadContext();
    return () => {
      // Invalidate any load still in flight.
      contextGenRef.current++;
    };
  }, [loadContext]);

  /** Read everything again, marking the account as being read. */
  const reload = useCallback(() => {
    setLoadingContext(true);
    void loadContext();
  }, [loadContext]);

  /** Another account is active: forget this one's figures and read again. */
  const reloadForNewAccount = useCallback(() => {
    setConnection(null);
    applyAccount(null);
    reload();
  }, [applyAccount, reload]);

  // The price alone, read again from the header.
  const quoteGenRef = useRef(0);
  const refreshQuote = useCallback(async () => {
    const gen = ++quoteGenRef.current;
    setRefreshingQuote(true);
    const quotes = await fetchQuotes([symbol]);
    if (gen !== quoteGenRef.current) return;
    applyQuote(quotes[symbol] ?? null);
    setRefreshingQuote(false);
  }, [symbol, applyQuote]);
  useEffect(
    () => () => {
      quoteGenRef.current++;
    },
    [],
  );

  /**
   * Buying power and the holding, read again after an order was accepted,
   * so the summary does not keep showing the pre-order ones.
   */
  const refreshAccount = useCallback(async () => {
    const gen = contextGenRef.current;
    try {
      const res = await fetch("/api/broker/account");
      if (gen !== contextGenRef.current) return;
      applyAccount(res.ok ? await res.json() : null);
    } catch {
      // Unreadable now: say so rather than keep the pre-order figures.
      if (gen === contextGenRef.current) applyAccount(null);
    }
  }, [applyAccount]);

  return {
    engineStatus,
    buyingPower,
    held,
    connection,
    /** For a pre-submit re-read that found no active connection. */
    clearConnection: () => setConnection(null),
    connectionFailed,
    quote,
    quoteState,
    refreshingQuote,
    loadingContext,
    loaded,
    reload,
    reloadForNewAccount,
    refreshQuote,
    refreshAccount,
  };
}
