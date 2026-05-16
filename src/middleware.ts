import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { AUTH_CONFIG } from "@/lib/config";

const secret = new TextEncoder().encode(AUTH_CONFIG.jwtSecret);

const protectedPaths = ["/dashboard"];

const isDev = process.env.NODE_ENV !== "production";
const useHttps = process.env.FORCE_HTTPS === "true";

/**
 * Build the per-request Content-Security-Policy. The nonce is the
 * critical bit — it lets us drop `'unsafe-inline'` from script-src
 * without breaking Next.js's own hydration / chunk-loader inline
 * scripts. Next.js auto-attaches the nonce when we set the `x-nonce`
 * request header from middleware.
 *
 * We keep host-based allowlisting alongside the nonce (no
 * `'strict-dynamic'`) because Cloudflare Insights and TradingView
 * inject scripts via `<script src=...>` that aren't loaded by a
 * nonce-trusted Next.js bootstrap — they're independent external
 * sources. With `'strict-dynamic'` the host allowlist gets ignored,
 * which would block both of them.
 *
 * `'unsafe-eval'` stays dev-only for HMR.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com https://s3.tradingview.com${isDev ? " 'unsafe-eval'" : ""}`,
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

  const csp = buildCsp(nonce);

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
      await jwtVerify(token, secret);
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
