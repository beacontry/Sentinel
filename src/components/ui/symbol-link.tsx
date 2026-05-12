"use client";

// Symbol → Analysis link. Wraps a ticker so it's discoverable as
// clickable across the app. Default destination is the Analysis page
// (where you can chart + read signal details); pass `to="trade"` to
// jump straight to the order ticket instead.
//
// Keep this dumb on purpose: one component → one href shape → consistent
// behavior everywhere. Used in tables, widgets, lists. Avoid spreading
// custom <Link> wrappers across the app.

import Link from "next/link";
import type { ReactNode } from "react";

interface SymbolLinkProps {
  symbol: string;
  to?: "analysis" | "trade";
  className?: string;
  children?: ReactNode;
  /** Stop propagation — useful when nested inside a row that already has its own click handler. */
  stopPropagation?: boolean;
}

export function SymbolLink({
  symbol,
  to = "analysis",
  className = "",
  children,
  stopPropagation = false,
}: SymbolLinkProps) {
  const href =
    to === "trade"
      ? `/dashboard/trade/${encodeURIComponent(symbol)}`
      : `/dashboard/analysis?symbol=${encodeURIComponent(symbol)}`;

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
      }}
      className={`font-mono text-text-primary hover:text-accent transition-colors ${className}`}
    >
      {children ?? symbol}
    </Link>
  );
}
