import { describe, it, expect } from "vitest";
import { reconstructMembership, parseChanges, type MembershipChange } from "@/lib/sp500";

// Replicates makeEligibleOn's lookup (the resolver wraps this; it's not exported).
function eligibleOn(boundaries: { from: string; set: Set<string> }[], dateKey: string): Set<string> {
  for (const b of boundaries) if (b.from <= dateKey) return b.set;
  return boundaries[boundaries.length - 1].set;
}

describe("reconstructMembership — walk the change log backward", () => {
  const changes: MembershipChange[] = [
    { dateKey: "2023-01-01", added: "B", removed: "Y" }, // intentionally out of order
    { dateKey: "2024-06-01", added: "C", removed: "X" },
  ];
  const { boundaries, union } = reconstructMembership(["A", "B", "C"], changes);

  it("orders boundaries newest-first with an epoch baseline last", () => {
    expect(boundaries.map((b) => b.from)).toEqual(["2024-06-01", "2023-01-01", "0000-00-00"]);
  });

  it("membership after the latest change is today's set", () => {
    expect([...eligibleOn(boundaries, "2024-07-01")].sort()).toEqual(["A", "B", "C"]);
  });

  it("reverses one change for a date between changes (C not yet added, X still in)", () => {
    expect([...eligibleOn(boundaries, "2024-03-01")].sort()).toEqual(["A", "B", "X"]);
  });

  it("reverses all changes for a pre-log date (B not yet added, X & Y still in)", () => {
    expect([...eligibleOn(boundaries, "2020-01-01")].sort()).toEqual(["A", "X", "Y"]);
  });

  it("union is every ticker that was ever a member in the window", () => {
    expect([...union].sort()).toEqual(["A", "B", "C", "X", "Y"]);
  });

  it("handles add-only / remove-only changes", () => {
    const { boundaries: b } = reconstructMembership(["A", "B"], [
      { dateKey: "2024-01-01", added: "B", removed: null }, // B added, nothing removed
    ]);
    expect([...eligibleOn(b, "2024-02-01")].sort()).toEqual(["A", "B"]); // after: has B
    expect([...eligibleOn(b, "2023-01-01")].sort()).toEqual(["A"]); // before: B not yet added
  });
});

describe("parseChanges — Wikipedia id=changes table", () => {
  const html = `
    <table id="changes" class="wikitable">
      <tbody>
        <tr><th>Effective Date</th><th>Added</th><th>Removed</th><th>Reason</th></tr>
        <tr><th>Ticker</th><th>Security</th><th>Ticker</th><th>Security</th></tr>
        <tr><td>May 7, 2026</td><td><a href="x">VEEV</a></td><td>Veeva Systems</td><td><a href="y">CTRA</a></td><td>Coterra Energy</td><td>Acquisition</td></tr>
        <tr><td>January 3, 2024</td><td><a>BRK.B</a></td><td>Berkshire</td><td></td><td></td><td>Add only</td></tr>
      </tbody>
    </table>`;

  it("extracts add/remove events with Yahoo-format tickers and ISO date keys", () => {
    const changes = parseChanges(html);
    expect(changes).toEqual([
      { dateKey: "2026-05-07", added: "VEEV", removed: "CTRA" },
      { dateKey: "2024-01-03", added: "BRK-B", removed: null }, // dot→dash, empty removed → null
    ]);
  });

  it("returns [] when the changes table is absent", () => {
    expect(parseChanges("<html><body>no table</body></html>")).toEqual([]);
  });
});
