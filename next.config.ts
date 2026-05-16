import type { NextConfig } from "next";

const useHttps = process.env.FORCE_HTTPS === "true";

// Content-Security-Policy moved to src/middleware.ts so each request
// can carry its own nonce. The static CSP that used to live here would
// have needed 'unsafe-inline' for Next.js's framework-emitted inline
// scripts; middleware-set CSP with a per-request nonce drops that
// requirement.

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Packages that should run from node_modules at runtime rather than being
  // bundled by webpack into the standalone output. Used for libs that
  // rely on dynamic imports, file-system reads, or native bindings that
  // don't survive Next.js's bundling pass.
  //
  //   pdf-parse        → v1.x — pinned because v2 pulls modern pdfjs-dist
  //                       which depends on DOMMatrix (browser global not
  //                       available in Node Alpine containers)
  //   adm-zip          → reads compiled buffers; bundler misses inner paths
  //   fast-xml-parser  → bundled fine, but kept here for consistency with
  //                       its sibling ingester deps
  //   node-html-parser → Cheerio-style; safer external than bundled
  //
  // Without this list, the cron/refresh-congress route 500s on first
  // request because its `node_modules/{pdf-parse,adm-zip,node-html-parser}`
  // never made it into the .next/standalone output. Symptom: route
  // returns a plain Next.js 500 HTML page (no JSON body, no log entry —
  // the throw happens during module load, before route handler executes).
  serverExternalPackages: [
    "pdf-parse",
    "adm-zip",
    "fast-xml-parser",
    "node-html-parser",
  ],
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
          // Content-Security-Policy is set per-request in src/middleware.ts
          // (per-request nonce). Setting it here would static-allow
          // 'unsafe-inline' or get overridden by middleware anyway.
        ],
      },
    ];
  },
};

export default nextConfig;
