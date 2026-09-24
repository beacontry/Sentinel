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

  it("prints a direction beside a toned summary figure", () => {
    expect(src).toContain("<DirectionGlyph");
    expect(src).toContain("<DirectionWord");
  });

  it("uses the loss triplet, not an alpha tint, for its warning tile", () => {
    expect(src).not.toMatch(/bg-bearish\/\d/);
    expect(src).toContain("bg-bearish-fill");
  });
});
