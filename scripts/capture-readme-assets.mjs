#!/usr/bin/env node
// Automate the README screenshot capture using Playwright.
//
// What it does:
//   1. Spins up a headless Chromium at 1600×1000 viewport
//   2. Logs in via session cookie (you provide BEACONTRY_SESSION env var)
//   3. Navigates to /dashboard/trader, /dashboard/tax-center,
//      /dashboard/admin/audit
//   4. Waits for the primary content to render
//   5. Saves PNG to docs/assets/screenshot-{trader,tax,audit}.png
//
// What it does NOT do:
//   - Record the animated GIF (motion capture is manual — record with
//     QuickTime/ShareX/peek, see README appendix for the ffmpeg pipeline)
//   - Generate fake data — your dev/staging instance needs realistic data
//     for the screenshots to look meaningful
//
// Usage:
//   1. Have the app running locally on port 3000 (or set BASE_URL).
//   2. Log in via browser, open DevTools → Application → Cookies →
//      copy the sentinel-session cookie value.
//   3. Run:
//        BEACONTRY_SESSION="<cookie value>" node scripts/capture-readme-assets.mjs
//   4. Or against staging:
//        BASE_URL=https://staging.beacontry.com \
//        BEACONTRY_SESSION="..." node scripts/capture-readme-assets.mjs
//
// Prerequisites:
//   npm install -D @playwright/test
//   npx playwright install chromium
//
// Output: docs/assets/screenshot-{trader,tax,audit}.png
// After capture: update the README screenshot table to point at .png
// (currently points at SVG placeholders).

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SESSION = process.env.BEACONTRY_SESSION;
const OUT_DIR = path.resolve(__dirname, "..", "docs", "assets");

if (!SESSION) {
  console.error("ERROR: BEACONTRY_SESSION env var is required.");
  console.error("");
  console.error("Get it by:");
  console.error("  1. Open browser, log in to Beacontry");
  console.error("  2. DevTools → Application → Cookies → copy 'sentinel-session' value");
  console.error("  3. Re-run with: BEACONTRY_SESSION='<value>' node scripts/capture-readme-assets.mjs");
  process.exit(1);
}

const SHOTS = [
  {
    name: "trader",
    path: "/dashboard/trader",
    // Wait for the engine status card to render so the screenshot isn't
    // a half-loaded skeleton.
    waitFor: "text=/Live trader|Trader|Engine status/i",
    description: "Trader page — engine + manual order ticket",
  },
  {
    name: "tax",
    path: "/dashboard/tax-center",
    waitFor: "text=/Tax Center|Wash-sale|Harvestable/i",
    description: "Tax Center — wash-sale + harvestable losses",
  },
  {
    name: "audit",
    path: "/dashboard/admin/audit",
    waitFor: "text=/Audit Log|Chain integrity/i",
    description: "Audit log — hash-chained, verifiable",
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`Connecting to ${BASE_URL}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2, // retina-quality PNG
});

// Set the session cookie. Domain is derived from BASE_URL.
const url = new URL(BASE_URL);
await context.addCookies([
  {
    name: "sentinel-session",
    value: SESSION,
    domain: url.hostname,
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "Lax",
  },
]);

const page = await context.newPage();

let captured = 0;
for (const shot of SHOTS) {
  const target = `${BASE_URL}${shot.path}`;
  const outPath = path.join(OUT_DIR, `screenshot-${shot.name}.png`);
  console.log(`\n→ ${target}`);
  try {
    await page.goto(target, { waitUntil: "networkidle", timeout: 30000 });
    if (shot.waitFor) {
      await page.waitForSelector(shot.waitFor, { timeout: 10000 }).catch(() => {
        console.log(`  (waitFor selector "${shot.waitFor}" not found — capturing anyway)`);
      });
    }
    // Settle for any post-load animations.
    await page.waitForTimeout(800);
    await page.screenshot({ path: outPath, fullPage: false });
    const stats = fs.statSync(outPath);
    console.log(`  ✓ ${outPath} (${(stats.size / 1024).toFixed(0)} KB)`);
    captured++;
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message ?? err}`);
  }
}

await browser.close();

console.log(`\n${captured} of ${SHOTS.length} screenshots captured.`);
if (captured === SHOTS.length) {
  console.log("\nNext steps:");
  console.log("  1. Inspect docs/assets/screenshot-*.png — they should look like real pages");
  console.log("  2. Run: npx oxipng -o 4 docs/assets/screenshot-*.png  (lossless ~30% smaller)");
  console.log("  3. Update README.md screenshot table: change .svg → .png on the 3 image lines");
  console.log("  4. Commit + push");
} else {
  console.log("Some captures failed. Common causes:");
  console.log("  - Session cookie expired or wrong value");
  console.log("  - App not running at BASE_URL");
  console.log("  - Page selectors changed (update SHOTS array)");
  process.exit(1);
}
