import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;
const TEST_KEY_HEX = randomBytes(32).toString("hex");
const TEST_KEY_B64 = randomBytes(32).toString("base64");
const WRONG_KEY_HEX = randomBytes(32).toString("hex");

async function loadCrypto() {
  // Force re-evaluation each test so env-var changes take effect
  // (getEncryptionKey reads process.env on every call, but be defensive)
  return await import("@/lib/crypto");
}

describe("crypto", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY_HEX;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
    }
  });

  describe("encrypt + decrypt round-trip", () => {
    it("encrypts and decrypts a simple string", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const plaintext = "my-api-key-12345";
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it("handles unicode payloads", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const plaintext = "🔐 secret café — résumé";
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    it("handles long payloads", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const plaintext = "a".repeat(10_000);
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    it("handles empty strings", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      expect(decrypt(encrypt(""))).toBe("");
    });

    it("works with base64-encoded key", async () => {
      process.env.ENCRYPTION_KEY = TEST_KEY_B64;
      const { encrypt, decrypt } = await loadCrypto();
      expect(decrypt(encrypt("hello"))).toBe("hello");
    });
  });

  describe("IV non-determinism", () => {
    it("produces different ciphertexts for the same plaintext", async () => {
      const { encrypt } = await loadCrypto();
      const a = encrypt("identical");
      const b = encrypt("identical");
      expect(a).not.toBe(b);
    });

    it("produces a 12-byte IV (24 hex chars) on each encryption", async () => {
      const { encrypt } = await loadCrypto();
      const ct = encrypt("x");
      const [iv] = ct.split(":");
      expect(iv).toHaveLength(24);
    });
  });

  describe("auth tag verification", () => {
    it("rejects ciphertext with a flipped byte in the encrypted section", async () => {
      const { encrypt, decrypt, CryptoError } = await loadCrypto();
      const ct = encrypt("untouched");
      const [iv, body, tag] = ct.split(":");
      // Flip a byte in the body
      const flipped = body.slice(0, -2) + (body.slice(-2) === "00" ? "ff" : "00");
      expect(() => decrypt(`${iv}:${flipped}:${tag}`)).toThrow(CryptoError);
    });

    it("rejects ciphertext with a tampered auth tag", async () => {
      const { encrypt, decrypt, CryptoError } = await loadCrypto();
      const ct = encrypt("untouched");
      const [iv, body, tag] = ct.split(":");
      const tampered = tag.slice(0, -2) + (tag.slice(-2) === "00" ? "ff" : "00");
      expect(() => decrypt(`${iv}:${body}:${tampered}`)).toThrow(CryptoError);
    });

    it("rejects ciphertext encrypted under a different key", async () => {
      const { encrypt } = await loadCrypto();
      const ct = encrypt("secret");

      // Switch to a different key and try to decrypt
      process.env.ENCRYPTION_KEY = WRONG_KEY_HEX;
      const { decrypt, CryptoError } = await loadCrypto();
      expect(() => decrypt(ct)).toThrow(CryptoError);
    });
  });

  describe("strict format enforcement", () => {
    it("throws on plaintext input (no silent passthrough)", async () => {
      const { decrypt, CryptoError } = await loadCrypto();
      expect(() => decrypt("not-encrypted")).toThrow(CryptoError);
    });

    it("throws on input with too few parts", async () => {
      const { decrypt, CryptoError } = await loadCrypto();
      expect(() => decrypt("aa:bb")).toThrow(CryptoError);
    });

    it("throws on input with too many parts", async () => {
      const { decrypt, CryptoError } = await loadCrypto();
      expect(() => decrypt("aa:bb:cc:dd")).toThrow(CryptoError);
    });

    it("throws on non-hex characters", async () => {
      const { decrypt, CryptoError } = await loadCrypto();
      expect(() => decrypt("zz:zz:zz")).toThrow(CryptoError);
    });

    it("throws on wrong IV length", async () => {
      const { decrypt, CryptoError } = await loadCrypto();
      // 8-byte IV instead of 12
      expect(() => decrypt(`${"aa".repeat(8)}:${"bb".repeat(16)}:${"cc".repeat(16)}`)).toThrow(
        CryptoError
      );
    });

    it("throws on wrong auth-tag length", async () => {
      const { decrypt, CryptoError } = await loadCrypto();
      // 8-byte tag instead of 16
      expect(() => decrypt(`${"aa".repeat(12)}:${"bb".repeat(16)}:${"cc".repeat(8)}`)).toThrow(
        CryptoError
      );
    });
  });

  describe("isEncrypted", () => {
    it("returns true for encrypted format", async () => {
      const { encrypt, isEncrypted } = await loadCrypto();
      expect(isEncrypted(encrypt("x"))).toBe(true);
    });

    it("returns false for plaintext", async () => {
      const { isEncrypted } = await loadCrypto();
      expect(isEncrypted("plaintext")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted("aa:bb")).toBe(false);
    });
  });

  describe("decryptLegacy migration helper", () => {
    it("returns plaintext input verbatim", async () => {
      const { decryptLegacy } = await loadCrypto();
      expect(decryptLegacy("legacy-plaintext-key")).toBe("legacy-plaintext-key");
    });

    it("decrypts properly encrypted input", async () => {
      const { encrypt, decryptLegacy } = await loadCrypto();
      expect(decryptLegacy(encrypt("modern"))).toBe("modern");
    });

    it("still throws on tampered encrypted input (does not silently swallow)", async () => {
      const { encrypt, decryptLegacy, CryptoError } = await loadCrypto();
      const ct = encrypt("x");
      const [iv, body, tag] = ct.split(":");
      const tampered = `${iv}:${body}:${tag.slice(0, -2)}${tag.slice(-2) === "00" ? "ff" : "00"}`;
      expect(() => decryptLegacy(tampered)).toThrow(CryptoError);
    });
  });

  describe("ENCRYPTION_KEY validation", () => {
    it("throws when env var is missing", async () => {
      delete process.env.ENCRYPTION_KEY;
      const { encrypt, CryptoError } = await loadCrypto();
      expect(() => encrypt("x")).toThrow(CryptoError);
    });

    it("throws when key is wrong length", async () => {
      process.env.ENCRYPTION_KEY = "tooshort";
      const { encrypt, CryptoError } = await loadCrypto();
      expect(() => encrypt("x")).toThrow(CryptoError);
    });
  });

  describe("safeCompare", () => {
    it("returns true for equal strings", async () => {
      const { safeCompare } = await loadCrypto();
      expect(safeCompare("abc", "abc")).toBe(true);
    });

    it("returns false for different strings", async () => {
      const { safeCompare } = await loadCrypto();
      expect(safeCompare("abc", "xyz")).toBe(false);
    });

    it("returns false for different lengths", async () => {
      const { safeCompare } = await loadCrypto();
      expect(safeCompare("abc", "abcd")).toBe(false);
    });
  });
});
