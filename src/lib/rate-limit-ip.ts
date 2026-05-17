// Rate-limit-safe client IP extraction.
//
// CRITICAL: the source is public on GitHub. Anyone can read this code
// and craft attacks. For security-relevant rate-limiting (auth, abuse,
// credential stuffing), we must ONLY trust headers an attacker cannot
// spoof end-to-end.
//
// Beacontry.com sits behind Cloudflare. Cloudflare strips any inbound
// `cf-connecting-ip` header from the client and replaces it with the
// real edge-connecting IP. Other headers (`x-forwarded-for`,
// `x-real-ip`) are CLIENT-SETTABLE and will be passed through by
// Cloudflare verbatim — using them as rate-limit keys lets an
// attacker bypass the limiter trivially by rotating header values
// per request.
//
// For audit logging (informational), `src/lib/audit.ts:extractIp`
// still falls back to `x-forwarded-for` etc — that's the claimed IP
// for forensic reference, not a trust boundary.
//
// Self-hosters not behind Cloudflare must adjust `TRUSTED_HEADER`
// below to their proxy's trusted header (e.g. `x-real-ip` if the
// upstream proxy sets it and strips client-provided values).

const TRUSTED_HEADER = "cf-connecting-ip";

/**
 * Returns the client IP from the only header an attacker cannot
 * spoof on Cloudflare. Falls back to "unknown" if not present.
 *
 * USE THIS FOR rate-limit keys, abuse counters, anything where
 * the IP is a security primitive.
 *
 * DO NOT USE THIS FOR audit logging — use audit.ts:extractIp() so
 * the audit row captures whatever the client claimed even if it
 * was spoofed (forensic completeness).
 */
export function getRateLimitIp(request: Request): string {
  const cf = request.headers.get(TRUSTED_HEADER);
  if (cf) return cf.trim();
  return "unknown";
}
