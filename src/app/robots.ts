// Auto-generated /robots.txt — served at https://beacontry.com/robots.txt.
//
// Next.js 15 picks this up from src/app/robots.ts. Allows all crawlers
// to index public content while excluding the auth-required dashboard
// and internal API routes (which return 401 to anonymous traffic
// anyway, but no reason to make crawlers waste budget on them).

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",      // auth-only workspace
          "/api/",            // never crawled — all routes are auth-gated
          "/login",           // not useful to index
          "/register",        // invite-only — don't want this ranking
          "/w/",              // user-shared watchlists are per-link
        ],
      },
    ],
    sitemap: "https://beacontry.com/sitemap.xml",
    host: "https://beacontry.com",
  };
}
