import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }
  // Key must be 32 bytes (256 bits) — accept hex-encoded or base64
  const buf = Buffer.from(key, "hex");
  if (buf.length === 32) return buf;
  const buf64 = Buffer.from(key, "base64");
  if (buf64.length === 32) return buf64;
  throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars)");
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
 * Also accepts plaintext (for backwards compatibility with unencrypted data).
 */
export function decrypt(ciphertext: string): string {
  // Backwards compatibility: if it doesn't look encrypted, return as-is
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");

    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return ciphertext;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    // If decryption fails, assume it's plaintext (migration period)
    return ciphertext;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
