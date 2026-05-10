import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
// Cipher section can be empty when plaintext is empty; iv and tag are fixed length.
const ENCRYPTED_FORMAT = /^[0-9a-f]+:[0-9a-f]*:[0-9a-f]+$/i;

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new CryptoError("ENCRYPTION_KEY environment variable is required");
  }
  // Key must be 32 bytes (256 bits) — accept hex-encoded or base64
  const buf = Buffer.from(key, "hex");
  if (buf.length === 32) return buf;
  const buf64 = Buffer.from(key, "base64");
  if (buf64.length === 32) return buf64;
  throw new CryptoError("ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars)");
}

/**
 * Returns true if the value matches the encrypted ciphertext format.
 * Useful for callers that need to migrate legacy unencrypted rows.
 */
export function isEncrypted(value: string): boolean {
  return ENCRYPTED_FORMAT.test(value);
}

/**
 * Encrypt a string with AES-256-GCM.
 * Returns: iv:ciphertext:authTag (all hex-encoded, colon-separated)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Accepts: iv:ciphertext:authTag (hex-encoded, colon-separated)
 *
 * Throws CryptoError on:
 *  - malformed input (wrong shape, non-hex characters)
 *  - wrong IV / tag length
 *  - auth-tag verification failure (tampered ciphertext or wrong key)
 *
 * Does NOT silently fall back to returning the input. Callers that need to
 * tolerate legacy unencrypted rows must use `decryptLegacy()` explicitly and
 * accept the security trade-off.
 */
export function decrypt(ciphertext: string): string {
  if (!ENCRYPTED_FORMAT.test(ciphertext)) {
    throw new CryptoError("Value is not in encrypted format (iv:ciphertext:tag hex)");
  }

  const parts = ciphertext.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");

  if (iv.length !== IV_LENGTH) {
    throw new CryptoError(`Invalid IV length (expected ${IV_LENGTH}, got ${iv.length})`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new CryptoError(`Invalid auth tag length (expected ${TAG_LENGTH}, got ${tag.length})`);
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (err) {
    // GCM throws on auth tag mismatch — the value was tampered with or encrypted under a different key.
    throw new CryptoError(
      `Decryption failed (likely tampered ciphertext or wrong key): ${
        err instanceof Error ? err.message : "unknown"
      }`
    );
  }
}

/**
 * Migration-only escape hatch. Returns the input verbatim when it doesn't
 * look encrypted. Use ONLY in scripts that walk the table to re-encrypt
 * legacy rows; never in request paths.
 */
export function decryptLegacy(value: string): string {
  if (!ENCRYPTED_FORMAT.test(value)) return value;
  return decrypt(value);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
