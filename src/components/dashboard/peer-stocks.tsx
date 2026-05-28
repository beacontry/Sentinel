"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";

interface PeerStocksProps {
  symbol: string;
  onPeerClick?: (ticker: string) => void;
}

export function PeerStocks({ symbol, onPeerClick }: PeerStocksProps) {
  const [peers, setPeers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    // Guard against a slow response for a previous symbol resolving after a
    // newer one and painting the wrong ticker's peers (symbol swaps in place).
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/peers/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setPeers(json.peers ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setPeers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="flex gap-1.5 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width="48px" height="24px" rounded="md" />
        ))}
      </div>
    );
  }

  if (error || peers.length === 0) {
    return (
      <p className="text-xs text-text-muted">
        No peer data available
      </p>
    );
  }

  function handleClick(ticker: string) {
    if (onPeerClick) {
      onPeerClick(ticker);
    } else {
      window.location.href = `/dashboard?symbol=${encodeURIComponent(ticker)}`;
    }
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {peers.slice(0, 12).map((ticker) => (
        <button
          key={ticker}
          onClick={() => handleClick(ticker)}
          className="inline-flex items-center rounded-md px-2 py-1 text-xs font-mono font-medium
            bg-accent/10 text-accent hover:bg-accent/20
            transition-colors duration-150 cursor-pointer min-h-[28px]"
        >
          {ticker}
        </button>
      ))}
    </div>
  );
}
