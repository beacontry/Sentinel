interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const g = globalThis as typeof globalThis & {
  __rateLimitStore?: Map<string, RateLimitEntry>;
};

g.__rateLimitStore ??= new Map();
const store = g.__rateLimitStore;

export function rateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count };
}

// Periodic cleanup of expired entries
const CLEANUP_INTERVAL = 60_000;
const g2 = globalThis as typeof globalThis & {
  __rateLimitCleanup?: ReturnType<typeof setInterval>;
};

if (!g2.__rateLimitCleanup) {
  g2.__rateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}
