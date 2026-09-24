#!/usr/bin/env node
// Redesign verification captures (docs/design/redesign-plan.md, section
// "Verification tooling"). Two targets:
//
//   --kit   The UI kit gallery rendered WITHOUT the app: the gallery is
//           server-rendered to static HTML (scripts/render-ui-kit.tsx) and
//           styled with globals.css compiled through Tailwind, so it needs
//           no database, no session and no dev server. Besides the
//           screenshots it runs the Stage 2 checks and exits non-zero on a
//           failure:
//             - keyboard pass: Tab through every stop, each shows a 2px
//               outline (on itself or on a focus-within wrapper);
//             - hit areas: every control is at least 44px tall, and every
//               button 44px wide, counting a ::before / ::after hit-area
//               pseudo-element;
//             - hit overlap: 1px inside each edge of every control, and of
//               its hit box, hits that control, not a neighbour's pseudo;
//             - the primary button hover paints accent-hover (not struck
//               through by a later class);
//             - a positioned sm Button keeps its absolute position;
//             - the confirm summary is a different fill from its dialog.
//
//   (default) The app routes, against a running instance (BASE_URL,
//           default http://localhost:3000) with a session cookie in
//           BEACONTRY_SESSION, as in capture-readme-assets.mjs. Never point
//           this at production. Runs the hit-area and hit-overlap checks
//           once per width (light theme) and exits non-zero on a failure.
//
// Both capture 390x844 and 1440x900 at fullPage in every theme plus
// colour-blind mode, assert scrollWidth <= innerWidth on every capture,
// and write shots/<stage>/<route>-<theme>-<width>.png (shots/ is ignored).
//
// Usage:
//   node scripts/capture-redesign.mjs --kit [--stage stage2]
//   BEACONTRY_SESSION=... node scripts/capture-redesign.mjs [--stage stage3a] [--routes /,/login]
//
// Needs @playwright/test (a devDependency) and a Chromium build:
//   npx playwright install chromium

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const KIT = flag("--kit");
const STAGE = opt("--stage", KIT ? "kit" : "current");
const OUT = path.join(ROOT, "shots", STAGE);
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

// The <html> classes for each capture. Light is the class-less base.
const THEMES = [
  ["light", ""],
  ["dark", "dark"],
  ["coral", "coral"],
  ["light-blue", "light-blue"],
  ["gray", "gray"],
  ["colorblind-light", "colorblind"],
  ["colorblind-dark", "colorblind dark"],
];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];
const ROUTES = opt(
  "--routes",
  "/,/login,/dashboard,/dashboard/trader,/dashboard/trade/AAPL,/dashboard/watchlists,/dashboard/tax-center,/dashboard/tax,/dashboard/admin/ui-kit",
).split(",");

const slug = (route) => (route === "/" ? "home" : route.replace(/^\//, "").replace(/[^\w-]+/g, "_"));
const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);

async function compiledCss() {
  const { default: postcss } = await import("postcss");
  const twModule = await import("@tailwindcss/postcss");
  const tw = twModule.default ?? twModule;
  const from = path.join(ROOT, "src", "app", "globals.css");
  const res = await postcss([tw({ base: ROOT })]).process(fs.readFileSync(from, "utf8"), { from });
  return res.css;
}

function renderKit() {
  const tsx = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  return execFileSync(
    process.execPath,
    [tsx, "--tsconfig", path.join(ROOT, "scripts", "tsconfig.render.json"), path.join(ROOT, "scripts", "render-ui-kit.tsx")],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
}

function kitDocument(css, body) {
  // The class is set per capture; `<main id="main">` matches the shell.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI kit</title><style>${css}</style></head>
<body class="min-h-screen bg-bg-primary text-text-primary antialiased"><main id="main">${body}</main></body></html>`;
}

async function assertNoSideScroll(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) fail(where, `scrolls sideways by ${over}px`);
}

/** Tab through the page: every stop must draw a 2px outline. */
async function keyboardPass(page, where) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  let stops = 0;
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      // Mark each stop: class strings are long, so markup prefixes collide.
      const seenBefore = el.hasAttribute("data-kstop");
      el.setAttribute("data-kstop", "");
      const visible = (color) => !/rgba?\([^)]*,\s*0\)$|transparent/.test(color.trim());
      // A 2px ring is either a visible outline or a solid box-shadow ring
      // (the field primitives draw ring-2 over a transparent outline).
      const ok = (node) => {
        const s = getComputedStyle(node);
        if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 && visible(s.outlineColor)) return true;
        for (const part of s.boxShadow.split(/,(?![^(]*\))/)) {
          const color = /(rgba?|oklch|oklab|color)\([^)]*\)/.exec(part)?.[0] ?? "";
          const lengths = [...part.replace(color, "").matchAll(/(-?[\d.]+)px/g)].map((m) => parseFloat(m[1]));
          if (color && visible(color) && lengths.length === 4 && lengths[2] === 0 && lengths[3] >= 2) return true;
        }
        return false;
      };
      // A composite field (SearchInput) paints the ring on its wrapper.
      let node = el;
      let good = false;
      for (let d = 0; d < 3 && node; d++, node = node.parentElement) {
        if (ok(node)) {
          good = true;
          break;
        }
      }
      const name = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);
      return { seenBefore, good, label: `${el.tagName.toLowerCase()} ${name}`.trim() };
    });
    if (!r || r.seenBefore) break;
    stops++;
    if (!r.good) fail(where, `focus stop "${r.label}" has no 2px ring`);
  }
  return stops;
}

/**
 * The box a control can be clicked in: its own box, grown by a ::before
 * or ::after pseudo, and by a wrapping <label> (Toggle).
 *
 * - On a positioned control the pseudo is its own hit-area pad. The sm
 *   Button's is centred on it (left 50% and a -50% translate), so the pad
 *   is taken as centred: the larger of the two widths and heights.
 * - On a static control the pseudo belongs to the nearest positioned
 *   ancestor: the stretched link of a tile (after:inset-0), which covers
 *   that ancestor. It is placed from the ancestor's box.
 *
 * Installed in the page as window.__hitBox by a string evaluate, which
 * the app's CSP does not see (an eval() inside a function would need
 * unsafe-eval).
 */
const HIT_BOX = `(el) => {
  const rect = el.getBoundingClientRect();
  let box = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  const grow = (o) => {
    box = {
      left: Math.min(box.left, o.left),
      right: Math.max(box.right, o.right),
      top: Math.min(box.top, o.top),
      bottom: Math.max(box.bottom, o.bottom),
    };
  };
  const positioned = getComputedStyle(el).position !== "static";
  let pad = false;
  for (const pseudo of ["::before", "::after"]) {
    const s = getComputedStyle(el, pseudo);
    if (s.content === "none" || s.position !== "absolute") continue;
    const pw = parseFloat(s.width);
    const ph = parseFloat(s.height);
    if (!Number.isFinite(pw) || !Number.isFinite(ph)) continue;
    if (positioned) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      grow({ left: cx - pw / 2, right: cx + pw / 2, top: cy - ph / 2, bottom: cy + ph / 2 });
      pad = true;
    } else {
      let cb = el.parentElement;
      while (cb && getComputedStyle(cb).position === "static") cb = cb.parentElement;
      if (!cb) continue;
      const c = cb.getBoundingClientRect();
      const left = c.left + cb.clientLeft + parseFloat(s.left);
      const top = c.top + cb.clientTop + parseFloat(s.top);
      grow({ left, right: left + pw, top, bottom: top + ph });
    }
  }
  const label = el.closest("label");
  if (label) grow(label.getBoundingClientRect());
  return { ...box, pad, w: box.right - box.left, h: box.bottom - box.top };
}`;

/**
 * Every interactive control reaches 44px tall, counting a hit-area
 * pseudo-element, and every button reaches 44px wide as well: an
 * icon-only sm button draws 36px and must pad sideways too. Text links
 * and form fields are measured for height only; their width is their
 * text or their layout.
 */
async function installHitBox(page) {
  await page.evaluate(`window.__hitBox = ${HIT_BOX}`);
}

async function hitAreas(page, where) {
  await installHitBox(page);
  const short = await page.evaluate(() => {
    const hitBox = window.__hitBox;
    const out = [];
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="switch"], [role="tab"]';
    for (const el of document.querySelectorAll(sel)) {
      const rect = el.getBoundingClientRect();
      // Not a target: hidden, or a visually hidden native mirror (the
      // Radix Select keeps a 1px <select aria-hidden> for forms).
      if (rect.width <= 1 || rect.height <= 1 || el.closest('[aria-hidden="true"]')) continue;
      const { w, h } = hitBox(el);
      const checkWidth = el.tagName === "BUTTON" || el.getAttribute("role") === "switch";
      const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30);
      if (h < 44 - 0.5 || (checkWidth && w < 44 - 0.5)) out.push(`${name} (${w.toFixed(1)}x${h.toFixed(1)}px)`);
    }
    return out;
  });
  for (const s of short) fail(where, `hit area under 44px: ${s}`);
}

/**
 * No control's hit area reaches over another's visible box, or over the
 * part of another's hit area that makes it 44px. A hit-area pseudo is
 * painted above earlier siblings, so an overhang silently moves the click
 * on a neighbour's edge (Edit opening Delete). Probe 1px inside each edge
 * of every control and of its hit-area pad: the point must hit that
 * control.
 */
async function hitOverlap(page, where) {
  await installHitBox(page);
  const stolen = await page.evaluate(() => {
    const hitBox = window.__hitBox;
    const out = [];
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="switch"], [role="tab"]';
    const name = (el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30);
    for (const el of document.querySelectorAll(sel)) {
      if (el.getBoundingClientRect().width <= 2 || el.getBoundingClientRect().height <= 2 || el.closest('[aria-hidden="true"]')) continue;
      // elementFromPoint sees only the viewport, so bring each control in.
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      const r = el.getBoundingClientRect();
      const b = hitBox(el);
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const points = [
        ["edge", r.left + 1, cy],
        ["edge", r.right - 1, cy],
        ["edge", cx, r.top + 1],
        ["edge", cx, r.bottom - 1],
      ];
      // A pad's edges are probed as well. A stretched link's overlay is
      // not: the actions laid over it are meant to take the click.
      if (b.pad) {
        points.push(
          ["hit box", b.left + 1, cy],
          ["hit box", b.right - 1, cy],
          ["hit box", cx, b.top + 1],
          ["hit box", cx, b.bottom - 1],
        );
      }
      for (const [kind, x, y] of points) {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const hit = document.elementFromPoint(x, y)?.closest(sel);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
          out.push(`${name(el)} ${kind} at (${Math.round(x)},${Math.round(y)}) hits ${name(hit)}`);
          break;
        }
      }
    }
    scrollTo(0, 0);
    return out;
  });
  for (const s of stolen) fail(where, `hit area overlap: ${s}`);
}

async function kitChecks(page, where) {
  // Primary hover: the painted fill must be accent-hover.
  const primary = page.locator("button", { hasText: /^Primary$/ }).first();
  await primary.hover();
  await page.waitForTimeout(250);
  const hover = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Primary");
    const probe = document.createElement("div");
    probe.style.background = "var(--color-accent-hover)";
    document.body.append(probe);
    const want = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { got: getComputedStyle(btn).backgroundColor, want };
  });
  if (hover.got !== hover.want) fail(where, `primary hover paints ${hover.got}, expected accent-hover ${hover.want}`);
  await page.mouse.move(0, 0);

  const kit = await page.evaluate(() => {
    const rm = document.querySelector('[data-kit="tile-remove"]');
    const dialog = document.querySelector('[data-kit="dialog-surface"]');
    const dl = dialog?.querySelector("dl");
    return {
      removePosition: rm ? getComputedStyle(rm).position : "missing",
      dialogFill: dialog ? getComputedStyle(dialog).backgroundColor : "missing",
      summaryFill: dl ? getComputedStyle(dl).backgroundColor : "missing",
    };
  });
  if (kit.removePosition !== "absolute") fail(where, `tile Remove button is position:${kit.removePosition}, not absolute`);
  if (kit.dialogFill === kit.summaryFill) fail(where, `confirm summary fill equals its dialog (${kit.summaryFill})`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  try {
    if (KIT) {
      const html = kitDocument(await compiledCss(), renderKit());
      for (const [themeName, cls] of THEMES) {
        for (const vp of VIEWPORTS) {
          const where = `ui-kit ${themeName} ${vp.width}`;
          const page = await browser.newPage({ viewport: vp });
          await page.setContent(html.replace('<html lang="en">', `<html lang="en" class="${cls}">`), { waitUntil: "load" });
          await assertNoSideScroll(page, where);
          await page.screenshot({ path: path.join(OUT, `ui-kit-${themeName}-${vp.width}.png`), fullPage: true });
          const stops = await keyboardPass(page, where);
          await hitAreas(page, where);
          await hitOverlap(page, where);
          await kitChecks(page, where);
          report.push({ where, stops });
          await page.close();
        }
      }
    } else {
      const session = process.env.BEACONTRY_SESSION;
      if (!session) {
        console.error("BEACONTRY_SESSION is required for the app routes (or pass --kit).");
        process.exitCode = 2;
        return;
      }
      const url = new URL(BASE_URL);
      for (const [themeName, cls] of THEMES) {
        for (const vp of VIEWPORTS) {
          const ctx = await browser.newContext({ viewport: vp });
          await ctx.addCookies([{ name: "sentinel-session", value: session, domain: url.hostname, path: "/" }]);
          // The app applies both before first paint from storage: the theme
          // from sentinel-theme (theme-init.js), colour-blind mode from the
          // display-prefs key (display-prefs-provider.tsx).
          await ctx.addInitScript((c) => {
            try {
              const parts = c.split(" ");
              localStorage.setItem("sentinel-theme", parts.filter((x) => x !== "colorblind")[0] || "light");
              const prefs = JSON.parse(localStorage.getItem("sentinel-display-prefs") || "{}");
              prefs.colorBlindMode = parts.includes("colorblind");
              localStorage.setItem("sentinel-display-prefs", JSON.stringify(prefs));
            } catch {}
          }, cls);
          const page = await ctx.newPage();
          for (const route of ROUTES) {
            const where = `${route} ${themeName} ${vp.width}`;
            await page.goto(BASE_URL + route, { waitUntil: "networkidle" });
            await page.waitForTimeout(400);
            await assertNoSideScroll(page, where);
            await page.screenshot({ path: path.join(OUT, `${slug(route)}-${themeName}-${vp.width}.png`), fullPage: true });
            // Hit areas do not depend on the theme: measure them once per
            // width, on the first theme.
            if (themeName === THEMES[0][0]) {
              await hitAreas(page, where);
              await hitOverlap(page, where);
            }
            report.push({ where });
          }
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ report, failures }, null, 2));
  console.log(`${report.length} captures in ${path.relative(ROOT, OUT)}`);
  if (KIT) console.log(`keyboard stops per capture: ${[...new Set(report.map((r) => r.stops))].join(", ")}`);
  if (failures.length) {
    console.error(`${failures.length} failures:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log("all checks passed");
  }
}

await main();
