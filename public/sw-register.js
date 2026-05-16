// Service worker registration. Extracted from an inline <script> in
// src/app/layout.tsx so the CSP can drop script-src 'unsafe-inline'
// (Batch 1 — security hardening, 2026-05-16). Loaded with
// <script src="/sw-register.js" defer> from the root layout.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
