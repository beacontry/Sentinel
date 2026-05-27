// Service worker registration. Extracted from an inline <script> in
// src/app/layout.tsx so the CSP can drop script-src 'unsafe-inline'
// (Batch 1 — security hardening, 2026-05-16). Loaded with
// <script src="/sw-register.js" defer> from the root layout.
//
// PR 23 (2026-05-27): no longer swallows registration errors. Silent
// .catch(() => {}) hid SW registration failures, which made PWA install
// problems impossible to diagnose remotely. Now logs to console.error so
// chrome://inspect picks them up.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Successful registration — quiet by default. Uncomment for verbose
        // debug: console.info("[SW] registered, scope:", reg.scope);
        void reg;
      })
      .catch((err) => {
        // Visible in chrome://inspect and DevTools console. PWA install
        // criteria require an active SW with a fetch handler; if this fires,
        // the install option will not appear in Chrome.
        console.error("[SW] registration failed:", err);
      });
  });
}
