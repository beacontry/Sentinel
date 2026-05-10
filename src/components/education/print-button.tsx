"use client";

import { Printer } from "lucide-react";

/**
 * Triggers the browser&apos;s native print dialog. Combined with print-specific
 * CSS in globals.css, this produces a clean PDF / printout: hides nav and
 * sidebar, expands TOC inline, prints the disclaimer prominently, omits
 * interactive controls (bookmark / quiz buttons).
 *
 * Why not server-side PDF generation? Browsers already have great print-to-PDF
 * support, and using window.print() avoids a Puppeteer/headless-Chrome
 * dependency on the server. Trade-off: layout fidelity is browser-dependent.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary print:hidden"
      aria-label="Print this guide or save as PDF"
      title="Print / Save as PDF"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
      Print / PDF
    </button>
  );
}
