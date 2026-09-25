"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
      aria-label="Print this guide or save as PDF"
      title="Print / Save as PDF"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
      Print / PDF
    </Button>
  );
}
