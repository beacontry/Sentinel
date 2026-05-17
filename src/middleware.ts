import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { AUTH_CONFIG } from "@/lib/config";

const secret = new TextEncoder().encode(AUTH_CONFIG.jwtSecret);

const protectedPaths = ["/dashboard"];

const isDev = process.env.NODE_ENV !== "production";
const useHttps = process.env.FORCE_HTTPS === "true";

/**
 * Build the per-request Content-Security-Policy.
 *
 * KNOWN LIMITATION — `'unsafe-inline'` is kept on script-src:
 *
 * Next.js's documented automatic nonce-stamping of inline scripts
 * only works for *dynamically rendered* routes. Static-rendered
 * pages (most of our public-marketing surface — landing, /pricing,
 * /login, /register, /terms, etc. — flagged `○` in the build
 * output) have their hydration / chunk-loader inline scripts baked
 * into the HTML at build time, before middleware ever runs. The
 * fresh per-request nonce on the CSP header doesn't match the
 * already-built script tags (which have no nonce attribute at all)
 * → every inline script gets blocked → white page.
 *
 * Removing 'unsafe-inline' broke prod twice today (commits c394e9d
 * and 14743d3). Documenting the trap here so the next person
 * doesn't try the same thing.
 *
 * The nonce is still generated and attached as `x-nonce` on the
 * request for the dynamic routes that *do* benefit (the dashboard
 * pages mostly), but the CSP keeps 'unsafe-inline' as a fallback
 * for the static pages. Net security: marginal improvement over
 * pure 'unsafe-inline' for the dynamic routes; same as before for
 * static. Real upgrade path is either (a) accept this, (b) build-
 * time script hashing post-prerender, or (c) Cloudflare Worker
 * injecting CSP with computed hashes per asset.
 *
 * `'unsafe-eval'` stays dev-only for HMR.
 */
function buildCsp(): string {
  return [
    "default-src 'self'",
    // CSP Level 3: if a nonce OR hash is present in script-src, the
    // browser IGNORES 'unsafe-inline'. We can't have both. Since the
    // nonce-only approach broke prod (Next.js doesn't auto-stamp the
    // nonce on statically-rendered pages' inline scripts), we keep
    // 'unsafe-inline' alone for now. Middleware still generates a
    // nonce for future use (e.g. a future build-time hash injection
    // step), but the CSP itself sits at the looser unsafe-inline
    // level until that work lands.
    `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://s3.tradingview.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https://s3.tradingview.com https://*.tradingview.com https://*.finnhub.io",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' https://query1.finance.yahoo.com https://finnhub.io https://cloudflareinsights.com https://static.cloudflareinsights.com https://*.tradingview.com${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "object-src 'none'",
    "form-action 'self'",
    "frame-src https://s.tradingview.com https://www.tradingview.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    ...(useHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Per-request nonce. Web Crypto on the Edge runtime gives us
  // crypto.getRandomValues. 16 bytes is the OWASP-recommended floor.
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const csp = buildCsp();

  // Auth gate — only fires for /dashboard. Other matched routes
  // (landing, /pricing, /login, /register, etc.) get the CSP
  // treatment without any auth check.
  const isProtected = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  if (isProtected) {
    const token = request.cookies.get(AUTH_CONFIG.cookieName)?.value;

    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const response = NextResponse.redirect(loginUrl);
      response.headers.set("Content-Security-Policy", csp);
      return response;
    }

    try {
      // Pin algorithm to HS256 — jose rejects alg=none by default, but
      // pinning explicitly defends against any future alg-confusion
      // attack (e.g. a downstream signer being tricked into emitting
      // an RS256-keyed token with a public-key-as-secret).
      await jwtVerify(token, secret, { algorithms: ["HS256"] });
    } catch {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.set(AUTH_CONFIG.cookieName, "", { maxAge: 0, path: "/" });
      response.headers.set("Content-Security-Policy", csp);
      return response;
    }
  }

  // Pass the nonce to the rendering side via a request header. Next.js
  // 15+ reads `x-nonce` from the request and stamps it on every
  // framework-emitted inline `<script>` automatically.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Match all routes EXCEPT API, Next internals, and common static
  // asset extensions. API routes return JSON (no inline script
  // concerns); Next assets are pre-cached and don't need a per-request
  // CSP; image/font/SW files don't execute scripts.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|sw-register.js|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|css|js|map)).*)",
  ],
};
