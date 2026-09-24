import { describe, it, expect } from "vitest";
import { selectionAfterFailedLoad } from "@/lib/run-selection";

describe("selectionAfterFailedLoad", () => {
  it("points the selection back at the run on screen when a click fails", () => {
    // A is shown, the user clicked B, B's detail failed.
    expect(selectionAfterFailedLoad("B", "B", "A")).toEqual({ revertTo: "A" });
  });

  it("reverts to nothing when the first click fails", () => {
    expect(selectionAfterFailedLoad("A", "A", null)).toEqual({ revertTo: null });
  });

  it("leaves a failed poll refresh of the run on screen alone", () => {
    expect(selectionAfterFailedLoad("A", "A", "A")).toBeNull();
  });

  it("leaves the selection alone when the user has since clicked another run", () => {
    // B failed, but the user already moved on to C.
    expect(selectionAfterFailedLoad("B", "C", "A")).toBeNull();
  });
});
