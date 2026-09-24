/**
 * ConfirmActionModal on the Stage 2 primitives. It renders inside a
 * Radix portal, which static rendering leaves empty, so these read the
 * source.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "..", "..", "src/components/ui/confirm-action-modal.tsx"), "utf8");

describe("ConfirmActionModal", () => {
  it("keeps the solid danger fill for the irreversible tone only", () => {
    expect(src).toMatch(/spec\?\.tone === "irreversible" \? "danger" : danger \? "destructive" : "primary"/);
  });

  it("labels the typed-keyword field through the Input primitive", () => {
    expect(src).toContain("<Input");
    expect(src).toContain("label={`Type ${spec.typedKeyword} to confirm`}");
    expect(src).not.toMatch(/<input\b/);
  });

  it("keeps its error region mounted instead of inserting it with the message", () => {
    expect(src).toMatch(/<p role="alert"[^>]*>\s*\{error \?\? ""\}/);
  });

  // A tone colours a row; it does not state a gain or loss. A zero or
  // unknown P&L once read "▲ $0.00 gain" because the glyph came from tone.
  it("never infers a direction from a row tone", () => {
    expect(src).not.toContain("DirectionGlyph");
    expect(src).not.toMatch(/tone === "bullish" \? "gain"/);
  });

  it("uses the loss triplet, not an alpha tint, for its warning tile", () => {
    expect(src).not.toMatch(/bg-bearish\/\d/);
    expect(src).toContain("bg-bearish-fill");
  });
});
