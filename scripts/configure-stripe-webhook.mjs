#!/usr/bin/env node
// scripts/configure-stripe-webhook.mjs
//
// Sync the live Stripe webhook endpoint's enabled-events list with what
// the code at src/app/api/webhooks/stripe/route.ts actually handles.
//
// Use case: every time the webhook handler grows a new case (e.g.
// charge.refunded shipped in commit 316bdaf), Stripe needs to start
// firing that event to the endpoint. Without updating the subscription,
// the new server-side handler is silent — Stripe never sends those
// events.
//
// Run:
//   STRIPE_SECRET_KEY=sk_live_... node scripts/configure-stripe-webhook.mjs
//   STRIPE_SECRET_KEY=sk_live_... node scripts/configure-stripe-webhook.mjs --yes      # non-interactive
//   STRIPE_SECRET_KEY=sk_live_... node scripts/configure-stripe-webhook.mjs --dry-run  # preview
//
// The script never prints the secret. It only reads it from env. It
// will exit immediately if STRIPE_SECRET_KEY is unset.

import Stripe from "stripe";
import readline from "node:readline/promises";

// ─── Configuration ────────────────────────────────────────────────────
const WEBHOOK_URL = "https://beacontry.com/api/webhooks/stripe";

// Must match the events the handler at src/app/api/webhooks/stripe/route.ts
// switches on. Update this list when you add a new case to handleEvent().
const DESIRED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "charge.refunded",
];

// ─── Flags ────────────────────────────────────────────────────────────
const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run") || flags.has("-n");
const skipConfirm = flags.has("--yes") || flags.has("-y");

// ─── Helpers ──────────────────────────────────────────────────────────
const COLORS = process.stdout.isTTY
  ? { red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m", blue: "\x1b[34m", dim: "\x1b[2m", reset: "\x1b[0m" }
  : { red: "", yellow: "", green: "", blue: "", dim: "", reset: "" };

function info(msg) { console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${msg}`); }
function ok(msg) { console.log(`${COLORS.green}[ OK ]${COLORS.reset} ${msg}`); }
function warn(msg) { console.log(`${COLORS.yellow}[WARN]${COLORS.reset} ${msg}`); }
function fail(msg) { console.error(`${COLORS.red}[FAIL]${COLORS.reset} ${msg}`); }

// ─── Pre-flight ──────────────────────────────────────────────────────
const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  fail("STRIPE_SECRET_KEY is not set.");
  console.error("");
  console.error("Run this script with the key in the environment, e.g.:");
  console.error(`  STRIPE_SECRET_KEY=sk_live_... node ${process.argv[1]}`);
  console.error("");
  console.error("If the key has been leaked, rotate FIRST (Stripe Dashboard");
  console.error("→ Developers → API keys → Roll key), then run this script");
  console.error("with the new key.");
  process.exit(1);
}

if (!secret.startsWith("sk_")) {
  fail("STRIPE_SECRET_KEY doesn't look right — expected to start with 'sk_'.");
  process.exit(1);
}

const isLive = secret.startsWith("sk_live_");
const mode = isLive ? "LIVE" : "TEST";

const stripe = new Stripe(secret, {
  apiVersion: "2026-04-22.dahlia",
  appInfo: { name: "beacontry-webhook-configurator", version: "1.0.0" },
});

// ─── Find the webhook endpoint by URL ─────────────────────────────────
info(`Connecting to Stripe (${mode} mode)`);
let endpoints;
try {
  endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
} catch (err) {
  fail(`Stripe API error: ${err.message ?? err}`);
  process.exit(1);
}

const target = endpoints.data.find((e) => e.url === WEBHOOK_URL);
if (!target) {
  fail(`No webhook endpoint found at ${WEBHOOK_URL}`);
  console.error("");
  console.error("Existing endpoints in this Stripe account:");
  for (const e of endpoints.data) {
    console.error(`  ${e.id}  ${e.url}  (${e.enabled_events.length} events, status=${e.status})`);
  }
  console.error("");
  console.error("If the endpoint hasn't been created yet, create it in the");
  console.error("Stripe Dashboard → Developers → Webhooks → Add endpoint.");
  console.error("Then re-run this script to set the event subscription.");
  process.exit(1);
}

ok(`Found endpoint: ${target.id}`);
info(`  URL:         ${target.url}`);
info(`  Status:      ${target.status}`);
info(`  Description: ${target.description ?? "(none)"}`);
info(`  Current events: ${target.enabled_events.length}`);

// ─── Diff current vs desired ──────────────────────────────────────────
const currentSet = new Set(target.enabled_events);
const desiredSet = new Set(DESIRED_EVENTS);
const toAdd = DESIRED_EVENTS.filter((e) => !currentSet.has(e));
const toRemove = target.enabled_events.filter((e) => !desiredSet.has(e));
const unchanged = DESIRED_EVENTS.filter((e) => currentSet.has(e));

console.log("");
console.log(`${COLORS.dim}═══ Event subscription diff ═══${COLORS.reset}`);
if (unchanged.length > 0) {
  console.log(`${COLORS.green}  unchanged (${unchanged.length}):${COLORS.reset}`);
  for (const e of unchanged) console.log(`    ${e}`);
}
if (toAdd.length > 0) {
  console.log(`${COLORS.yellow}  + to add (${toAdd.length}):${COLORS.reset}`);
  for (const e of toAdd) console.log(`    + ${e}`);
}
if (toRemove.length > 0) {
  console.log(`${COLORS.red}  - to remove (${toRemove.length}):${COLORS.reset}`);
  for (const e of toRemove) console.log(`    - ${e}`);
}
if (toAdd.length === 0 && toRemove.length === 0) {
  console.log(`${COLORS.green}  No changes needed — endpoint is already in sync.${COLORS.reset}`);
}
console.log("");

if (toAdd.length === 0 && toRemove.length === 0) {
  ok("Done.");
  process.exit(0);
}

if (dryRun) {
  info("Dry-run — no changes made.");
  process.exit(0);
}

// ─── Confirm + apply ─────────────────────────────────────────────────
if (!skipConfirm) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `${COLORS.yellow}Apply these changes to the ${mode} endpoint? Type 'yes' to confirm: ${COLORS.reset}`
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    warn("Aborted.");
    process.exit(0);
  }
}

info("Applying changes…");
try {
  const updated = await stripe.webhookEndpoints.update(target.id, {
    enabled_events: DESIRED_EVENTS,
    description: target.description ?? "Beacontry billing webhook (auto-managed by configure-stripe-webhook.mjs)",
  });
  ok(`Endpoint updated. Now listening to ${updated.enabled_events.length} events:`);
  for (const e of updated.enabled_events) console.log(`    ${e}`);
} catch (err) {
  fail(`Stripe API error: ${err.message ?? err}`);
  console.error("");
  console.error("Webhook may be partially updated. Re-run this script to confirm");
  console.error("state, or inspect at Stripe Dashboard → Developers → Webhooks.");
  process.exit(1);
}

console.log("");
ok("All done. Test from Stripe Dashboard → Developers → Webhooks → your endpoint → Send test webhook.");
