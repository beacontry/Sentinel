import { describe, it, expect, beforeEach } from "vitest";
import { searchGuides, _resetIndexForTests } from "@/lib/education/guide-search";

beforeEach(() => {
  _resetIndexForTests();
});

describe("searchGuides", () => {
  it("returns empty array for empty query", () => {
    expect(searchGuides("")).toEqual([]);
    expect(searchGuides("   ")).toEqual([]);
  });

  it("returns empty array for purely-stopword query", () => {
    expect(searchGuides("the and is")).toEqual([]);
  });

  it("finds Roth IRA guide for 'roth ira' query", () => {
    const hits = searchGuides("what is a roth ira", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].slug).toBe("roth-ira-deep-dive");
  });

  it("finds HSA guide for 'hsa health savings' query", () => {
    const hits = searchGuides("how does an hsa work", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].slug).toBe("hsa-stealth-retirement");
  });

  it("finds Backdoor Roth guide for 'backdoor' query", () => {
    const hits = searchGuides("backdoor roth conversion", 3);
    expect(hits[0].slug).toBe("backdoor-and-mega-backdoor-roth");
  });

  it("finds 529 guide for '529 college' query", () => {
    const hits = searchGuides("529 plan for college", 3);
    expect(hits[0].slug).toBe("529-plans-explained");
  });

  it("finds MTM guide for '475(f)' query", () => {
    const hits = searchGuides("section 475(f) mark-to-market election", 3);
    expect(hits[0].slug).toBe("trader-tax-status-and-mtm-election");
  });

  it("finds wash sale guide for 'wash sale' query", () => {
    const hits = searchGuides("wash sale rules", 3);
    expect(hits[0].slug).toBe("wash-sale-rules-deep-dive");
  });

  it("de-duplicates results by guide", () => {
    // Many sections in the Roth IRA guide should still produce only one hit
    const hits = searchGuides("roth ira contribution conversion limit", 5);
    const slugs = hits.map((h) => h.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("respects topK", () => {
    const hits = searchGuides("tax retirement", 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("returns descending scores", () => {
    const hits = searchGuides("retirement tax-free contribution", 3);
    if (hits.length >= 2) {
      for (let i = 1; i < hits.length; i++) {
        expect(hits[i].score).toBeLessThanOrEqual(hits[i - 1].score);
      }
    }
  });

  it("each hit includes a usable section snippet", () => {
    const hits = searchGuides("roth ira", 1);
    expect(hits[0].snippet.length).toBeGreaterThan(20);
    expect(hits[0].snippet.length).toBeLessThanOrEqual(330);
    expect(hits[0].sectionId).toBeTruthy();
    expect(hits[0].sectionHeading).toBeTruthy();
  });

  it("finds estate planning guide for 'will beneficiary' query", () => {
    const hits = searchGuides("will beneficiary designation", 3);
    expect(hits[0].slug).toBe("estate-planning-basics");
  });
});
