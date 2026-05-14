import { describe, it, expect } from "vitest";
import {
  TIERS,
  tierRank,
  userHasTier,
  effectiveTier,
  buildUpgradeRequiredPayload,
  labelFor,
  isTier,
} from "@/lib/tiers";

describe("tiers", () => {
  describe("TIERS constant", () => {
    it("has four tiers in strict ascending order", () => {
      expect(TIERS).toEqual(["free", "trader", "premium", "enterprise"]);
    });
  });

  describe("tierRank", () => {
    it("returns index for each valid tier", () => {
      expect(tierRank("free")).toBe(0);
      expect(tierRank("trader")).toBe(1);
      expect(tierRank("premium")).toBe(2);
      expect(tierRank("enterprise")).toBe(3);
    });

    it("returns -1 for unknown / null / undefined", () => {
      expect(tierRank("vip")).toBe(-1);
      expect(tierRank("")).toBe(-1);
      expect(tierRank(null)).toBe(-1);
      expect(tierRank(undefined)).toBe(-1);
    });
  });

  describe("userHasTier", () => {
    it("returns true when user is at exactly the required tier", () => {
      expect(userHasTier("trader", "trader")).toBe(true);
      expect(userHasTier("premium", "premium")).toBe(true);
    });

    it("returns true when user is at a higher tier than required", () => {
      expect(userHasTier("premium", "trader")).toBe(true);
      expect(userHasTier("enterprise", "free")).toBe(true);
      expect(userHasTier("enterprise", "premium")).toBe(true);
    });

    it("returns false when user is at a lower tier than required", () => {
      expect(userHasTier("free", "trader")).toBe(false);
      expect(userHasTier("trader", "premium")).toBe(false);
      expect(userHasTier("premium", "enterprise")).toBe(false);
    });

    it("free user does not have any paid tier", () => {
      expect(userHasTier("free", "trader")).toBe(false);
      expect(userHasTier("free", "premium")).toBe(false);
      expect(userHasTier("free", "enterprise")).toBe(false);
    });

    it("returns false (fail-safe) for unknown user tier", () => {
      expect(userHasTier("legacy_premium", "trader")).toBe(false);
      expect(userHasTier(null, "trader")).toBe(false);
      expect(userHasTier(undefined, "free")).toBe(false);
    });
  });

  describe("effectiveTier", () => {
    it("returns tier as-is for unexpired paid subscriptions", () => {
      const future = new Date(Date.now() + 86_400_000);
      expect(effectiveTier({ tier: "trader", tierExpiresAt: future })).toBe("trader");
      expect(effectiveTier({ tier: "premium", tierExpiresAt: future })).toBe("premium");
    });

    it("returns tier as-is when tierExpiresAt is null (auto-renewing)", () => {
      expect(effectiveTier({ tier: "trader", tierExpiresAt: null })).toBe("trader");
      expect(effectiveTier({ tier: "premium" })).toBe("premium");
    });

    it("downgrades expired paid subscriptions to free", () => {
      const past = new Date(Date.now() - 86_400_000);
      expect(effectiveTier({ tier: "trader", tierExpiresAt: past })).toBe("free");
      expect(effectiveTier({ tier: "premium", tierExpiresAt: past })).toBe("free");
    });

    it("free has no expiry concept", () => {
      const past = new Date(Date.now() - 86_400_000);
      expect(effectiveTier({ tier: "free", tierExpiresAt: past })).toBe("free");
      expect(effectiveTier({ tier: "free", tierExpiresAt: null })).toBe("free");
    });

    it("enterprise is never auto-expired (admin-granted)", () => {
      // Even if expiresAt is past, enterprise stays enterprise — that's an
      // admin-managed tier, the expiry tracking is for paid subs only.
      const past = new Date(Date.now() - 86_400_000);
      expect(effectiveTier({ tier: "enterprise", tierExpiresAt: past })).toBe("enterprise");
    });

    it("defaults to free for null / missing tier", () => {
      expect(effectiveTier({ tier: null })).toBe("free");
      expect(effectiveTier({ tier: undefined })).toBe("free");
      expect(effectiveTier({})).toBe("free");
    });

    it("falls back to free for unknown tier strings", () => {
      expect(effectiveTier({ tier: "vip" })).toBe("free");
      expect(effectiveTier({ tier: "legacy_premium" })).toBe("free");
    });
  });

  describe("buildUpgradeRequiredPayload", () => {
    it("returns API Error Contract shape with correct code", () => {
      const payload = buildUpgradeRequiredPayload("free", "trader");
      expect(payload.error.code).toBe("TIER_INSUFFICIENT");
      expect(payload.error.retryable).toBe(false);
      expect(payload.error.details.currentTier).toBe("free");
      expect(payload.error.details.requiredTier).toBe("trader");
      expect(payload.error.details.upgradeUrl).toBe("/pricing");
    });

    it("message references both tiers by their UI labels", () => {
      const payload = buildUpgradeRequiredPayload("free", "premium");
      expect(payload.error.message).toContain("Premium");
      expect(payload.error.message).toContain("Free");
    });
  });

  describe("labelFor", () => {
    it("returns capitalized labels", () => {
      expect(labelFor("free")).toBe("Free");
      expect(labelFor("trader")).toBe("Trader");
      expect(labelFor("premium")).toBe("Premium");
      expect(labelFor("enterprise")).toBe("Enterprise");
    });
  });

  describe("isTier", () => {
    it("narrows valid tier strings", () => {
      expect(isTier("free")).toBe(true);
      expect(isTier("trader")).toBe(true);
      expect(isTier("premium")).toBe(true);
      expect(isTier("enterprise")).toBe(true);
    });

    it("rejects unknown strings", () => {
      expect(isTier("vip")).toBe(false);
      expect(isTier("")).toBe(false);
      expect(isTier("Free")).toBe(false); // case-sensitive
    });
  });
});
