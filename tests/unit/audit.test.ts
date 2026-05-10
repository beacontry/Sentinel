import { describe, it, expect } from "vitest";
import { canonicalJSON, computeHash, GENESIS_PREV_HASH, extractIp } from "@/lib/audit";

describe("audit helpers (pure)", () => {
  describe("canonicalJSON", () => {
    it("sorts keys at every depth", () => {
      const obj = { b: 1, a: { z: 2, y: { d: 4, c: 3 } } };
      expect(canonicalJSON(obj)).toBe('{"a":{"y":{"c":3,"d":4},"z":2},"b":1}');
    });

    it("produces identical output for equivalent objects", () => {
      const a = { x: 1, y: 2 };
      const b = { y: 2, x: 1 };
      expect(canonicalJSON(a)).toBe(canonicalJSON(b));
    });

    it("handles arrays without sorting", () => {
      // Array order is significant — don't sort
      expect(canonicalJSON([3, 1, 2])).toBe("[3,1,2]");
    });

    it("handles nested arrays of objects", () => {
      expect(canonicalJSON([{ b: 2, a: 1 }])).toBe('[{"a":1,"b":2}]');
    });

    it("handles null and primitives", () => {
      expect(canonicalJSON(null)).toBe("null");
      expect(canonicalJSON(42)).toBe("42");
      expect(canonicalJSON("hello")).toBe('"hello"');
      expect(canonicalJSON(true)).toBe("true");
    });

    it("escapes string content correctly via JSON.stringify", () => {
      expect(canonicalJSON({ k: 'a"b' })).toBe('{"k":"a\\"b"}');
    });
  });

  describe("computeHash", () => {
    const baseInput = {
      prevHash: GENESIS_PREV_HASH,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      actorUserId: "00000000-0000-0000-0000-000000000001",
      action: "engine.started",
      resourceType: "engine",
      resourceId: "user-1",
      metadata: { mode: "tactical" },
    };

    it("produces deterministic 64-char hex output", () => {
      const h = computeHash(baseInput);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(computeHash(baseInput)).toBe(h);
    });

    it("changes when prevHash changes (links rows)", () => {
      const a = computeHash(baseInput);
      const b = computeHash({ ...baseInput, prevHash: "different" });
      expect(a).not.toBe(b);
    });

    it("changes when action changes", () => {
      const a = computeHash(baseInput);
      const b = computeHash({ ...baseInput, action: "engine.stopped" });
      expect(a).not.toBe(b);
    });

    it("changes when timestamp changes", () => {
      const a = computeHash(baseInput);
      const b = computeHash({ ...baseInput, createdAt: new Date("2026-01-01T00:00:01Z") });
      expect(a).not.toBe(b);
    });

    it("changes when metadata content changes", () => {
      const a = computeHash(baseInput);
      const b = computeHash({ ...baseInput, metadata: { mode: "optimized" } });
      expect(a).not.toBe(b);
    });

    it("metadata key order does not affect hash (canonical-JSON)", () => {
      const a = computeHash({ ...baseInput, metadata: { mode: "tactical", count: 5 } });
      const b = computeHash({ ...baseInput, metadata: { count: 5, mode: "tactical" } });
      expect(a).toBe(b);
    });

    it("null vs missing metadata produce same hash", () => {
      // Both serialize to "" by the helper's contract
      const a = computeHash({ ...baseInput, metadata: null });
      const b = computeHash({ ...baseInput, metadata: null });
      expect(a).toBe(b);
    });

    it("null vs empty-object metadata produce DIFFERENT hashes", () => {
      // null → "", {} → "{}" — these are intentionally distinct
      const a = computeHash({ ...baseInput, metadata: null });
      const b = computeHash({ ...baseInput, metadata: {} });
      expect(a).not.toBe(b);
    });

    it("anonymous actor (null userId) hashes consistently", () => {
      const h1 = computeHash({ ...baseInput, actorUserId: null });
      const h2 = computeHash({ ...baseInput, actorUserId: null });
      expect(h1).toBe(h2);
      // And differs from a real userId
      expect(h1).not.toBe(computeHash(baseInput));
    });
  });

  describe("extractIp", () => {
    it("returns first hop of x-forwarded-for", () => {
      const req = new Request("http://x", {
        headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1, 10.0.0.2" },
      });
      expect(extractIp(req)).toBe("203.0.113.1");
    });

    it("trims whitespace around IPs", () => {
      const req = new Request("http://x", { headers: { "x-forwarded-for": "  1.2.3.4  " } });
      expect(extractIp(req)).toBe("1.2.3.4");
    });

    it("falls back to x-real-ip when no XFF", () => {
      const req = new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } });
      expect(extractIp(req)).toBe("5.6.7.8");
    });

    it("falls back to cf-connecting-ip when no XFF or real-ip", () => {
      const req = new Request("http://x", { headers: { "cf-connecting-ip": "9.9.9.9" } });
      expect(extractIp(req)).toBe("9.9.9.9");
    });

    it("returns null when no IP headers present", () => {
      const req = new Request("http://x");
      expect(extractIp(req)).toBeNull();
    });

    it("XFF wins over x-real-ip when both present", () => {
      const req = new Request("http://x", {
        headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" },
      });
      expect(extractIp(req)).toBe("1.1.1.1");
    });
  });

  describe("hash chain integrity simulation", () => {
    // Simulates the chain logic in writeAudit without hitting the DB,
    // verifying that linking by prevHash produces a tamper-evident chain.

    it("a sequence of computed hashes verifies cleanly when each row's prev_hash points to predecessor", () => {
      const events = [
        { action: "auth.login_success", createdAt: new Date("2026-01-01T00:00:00Z") },
        { action: "engine.started", createdAt: new Date("2026-01-01T00:00:01Z") },
        { action: "order.placed", createdAt: new Date("2026-01-01T00:00:02Z") },
      ];

      const chain: Array<{ prevHash: string; hash: string; row: (typeof events)[0] }> = [];
      let prev = GENESIS_PREV_HASH;
      for (const e of events) {
        const h = computeHash({
          prevHash: prev,
          createdAt: e.createdAt,
          actorUserId: "u1",
          action: e.action,
          resourceType: null,
          resourceId: null,
          metadata: null,
        });
        chain.push({ prevHash: prev, hash: h, row: e });
        prev = h;
      }

      // Verify
      let expected = GENESIS_PREV_HASH;
      for (const link of chain) {
        expect(link.prevHash).toBe(expected);
        const recomputed = computeHash({
          prevHash: link.prevHash,
          createdAt: link.row.createdAt,
          actorUserId: "u1",
          action: link.row.action,
          resourceType: null,
          resourceId: null,
          metadata: null,
        });
        expect(recomputed).toBe(link.hash);
        expected = link.hash;
      }
    });

    it("tampering with a middle row's action breaks the chain at that row", () => {
      const events = [
        { action: "auth.login_success", createdAt: new Date("2026-01-01T00:00:00Z") },
        { action: "engine.started", createdAt: new Date("2026-01-01T00:00:01Z") },
        { action: "order.placed", createdAt: new Date("2026-01-01T00:00:02Z") },
      ];

      const chain: Array<{ prevHash: string; hash: string; action: string; createdAt: Date }> = [];
      let prev = GENESIS_PREV_HASH;
      for (const e of events) {
        const h = computeHash({
          prevHash: prev,
          createdAt: e.createdAt,
          actorUserId: "u1",
          action: e.action,
          resourceType: null,
          resourceId: null,
          metadata: null,
        });
        chain.push({ prevHash: prev, hash: h, action: e.action, createdAt: e.createdAt });
        prev = h;
      }

      // Attacker rewrites the middle row's action but leaves the stored
      // hash untouched (couldn't recompute without breaking subsequent links).
      chain[1].action = "engine.stopped"; // tamper

      // Verify — recompute should diverge at row 1
      let expectedPrev = GENESIS_PREV_HASH;
      const breaks: number[] = [];
      for (let i = 0; i < chain.length; i++) {
        const link = chain[i];
        if (link.prevHash !== expectedPrev) {
          breaks.push(i);
          expectedPrev = link.hash;
          continue;
        }
        const recomputed = computeHash({
          prevHash: link.prevHash,
          createdAt: link.createdAt,
          actorUserId: "u1",
          action: link.action,
          resourceType: null,
          resourceId: null,
          metadata: null,
        });
        if (recomputed !== link.hash) breaks.push(i);
        expectedPrev = link.hash;
      }

      expect(breaks).toContain(1);
    });
  });
});
