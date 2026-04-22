import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  addSymbolSchema,
  chatMessageSchema,
  createWebhookSchema,
  createJournalSchema,
  createBrokerConnectionSchema,
  placeBrokerOrderSchema,
  updateRiskProfileSchema,
} from "@/lib/validators";

// ─── registerSchema ──────────────────────────────────────────────

describe("registerSchema", () => {
  it("accepts valid registration", () => {
    const result = registerSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      password: "secure1pass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short name", () => {
    const result = registerSchema.safeParse({
      name: "J",
      email: "john@example.com",
      password: "secure1pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      name: "John",
      email: "not-an-email",
      password: "secure1pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without numbers", () => {
    const result = registerSchema.safeParse({
      name: "John",
      email: "john@example.com",
      password: "nothaveanumber",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without letters", () => {
    const result = registerSchema.safeParse({
      name: "John",
      email: "john@example.com",
      password: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 chars", () => {
    const result = registerSchema.safeParse({
      name: "John",
      email: "john@example.com",
      password: "short1",
    });
    expect(result.success).toBe(false);
  });
});

// ─── loginSchema ─────────────────────────────────────────────────

describe("loginSchema", () => {
  it("accepts valid login", () => {
    const result = loginSchema.safeParse({
      email: "john@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "john@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── addSymbolSchema ─────────────────────────────────────────────

describe("addSymbolSchema", () => {
  it("accepts valid symbol", () => {
    const result = addSymbolSchema.safeParse({ symbol: "AAPL" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.symbol).toBe("AAPL");
    }
  });

  it("uppercases and trims input", () => {
    const result = addSymbolSchema.safeParse({ symbol: " msft " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.symbol).toBe("MSFT");
    }
  });

  it("rejects empty symbol", () => {
    const result = addSymbolSchema.safeParse({ symbol: "" });
    expect(result.success).toBe(false);
  });

  it("rejects symbol over 10 chars", () => {
    const result = addSymbolSchema.safeParse({ symbol: "TOOLONGSYMBOL" });
    expect(result.success).toBe(false);
  });
});

// ─── chatMessageSchema ──────────────────────────────────────────

describe("chatMessageSchema", () => {
  it("accepts valid message", () => {
    const result = chatMessageSchema.safeParse({ message: "Analyze AAPL" });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = chatMessageSchema.safeParse({ message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects message over 2000 chars", () => {
    const result = chatMessageSchema.safeParse({ message: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("accepts optional sessionId as UUID", () => {
    const result = chatMessageSchema.safeParse({
      message: "test",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid sessionId format", () => {
    const result = chatMessageSchema.safeParse({
      message: "test",
      sessionId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// ─── createWebhookSchema ────────────────────────────────────────

describe("createWebhookSchema", () => {
  it("accepts valid Discord webhook", () => {
    const result = createWebhookSchema.safeParse({
      name: "Alerts",
      webhookUrl: "https://discord.com/api/webhooks/123/abc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-Discord URL", () => {
    const result = createWebhookSchema.safeParse({
      name: "Alerts",
      webhookUrl: "https://slack.com/webhook/123",
    });
    expect(result.success).toBe(false);
  });

  it("defaults minSignalStrength to 1", () => {
    const result = createWebhookSchema.safeParse({
      name: "Alerts",
      webhookUrl: "https://discord.com/api/webhooks/123/abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minSignalStrength).toBe(1);
    }
  });
});

// ─── placeBrokerOrderSchema ─────────────────────────────────────

describe("placeBrokerOrderSchema", () => {
  it("accepts valid market order", () => {
    const result = placeBrokerOrderSchema.safeParse({
      symbol: "aapl",
      side: "buy",
      qty: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.symbol).toBe("AAPL"); // uppercased
      expect(result.data.type).toBe("market"); // defaulted
    }
  });

  it("accepts limit order with price", () => {
    const result = placeBrokerOrderSchema.safeParse({
      symbol: "MSFT",
      side: "sell",
      qty: "5",
      type: "limit",
      limitPrice: "300.50",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid side", () => {
    const result = placeBrokerOrderSchema.safeParse({
      symbol: "AAPL",
      side: "short",
      qty: "10",
    });
    expect(result.success).toBe(false);
  });
});

// ─── updateRiskProfileSchema ────────────────────────────────────

describe("updateRiskProfileSchema", () => {
  it("accepts valid risk profile update", () => {
    const result = updateRiskProfileSchema.safeParse({
      accountSize: 100000,
      maxDailyLossPct: 2,
      riskTolerance: "moderate",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty update (all optional)", () => {
    const result = updateRiskProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid risk tolerance", () => {
    const result = updateRiskProfileSchema.safeParse({
      riskTolerance: "yolo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects account size below minimum", () => {
    const result = updateRiskProfileSchema.safeParse({
      accountSize: 50,
    });
    expect(result.success).toBe(false);
  });
});
