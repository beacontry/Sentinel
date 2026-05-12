import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const useHttps = process.env.FORCE_HTTPS === "true";

const csp = [
  "default-src 'self'",
  // Next.js dev mode requires 'unsafe-eval' for hot reload.
  // Cloudflare Web Analytics injects beacon.min.js when CF Insights is enabled
  // on the domain — allow its origins so the CSP doesn't block it.
  // TradingView Advanced Chart loads s3.tradingview.com/tv.js which then
  // injects iframes from s.tradingview.com / charting-library and pulls
  // images for ticker logos. Whitelist all three origins.
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://s3.tradingview.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https://s3.tradingview.com https://*.tradingview.com",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' https://query1.finance.yahoo.com https://finnhub.io https://cloudflareinsights.com https://*.tradingview.com${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "object-src 'none'",
  "form-action 'self'",
  "frame-src https://s.tradingview.com https://www.tradingview.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  ...(useHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(useHttps ? [{
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          }] : []),
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
