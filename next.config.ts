import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const useHttps = process.env.FORCE_HTTPS === "true";

const csp = [
  "default-src 'self'",
  // Next.js dev mode requires 'unsafe-eval' for hot reload.
  // Cloudflare Web Analytics injects beacon.min.js when CF Insights is enabled
  // on the domain — allow its origins so the CSP doesn't block it.
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' https://query1.finance.yahoo.com https://finnhub.io https://cloudflareinsights.com${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "object-src 'none'",
  "form-action 'self'",
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
