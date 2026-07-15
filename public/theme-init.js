// Pre-paint theme application. Loaded BLOCKING (no defer) in <head> so the
// first paint already carries the right theme class — previously the SSR
// markup had no class (= light), and hydration flipped dark a beat later
// (flash of wrong theme on every cold load).
//
// Dark is the default for first-time visitors (2026-07-15 — the product's
// stated identity is a low-light trading terminal; light/coral/light-blue
// remain one click away in the theme picker and explicit choices persist).
//
// Kept as a static file (not dangerouslySetInnerHTML) per the same CSP
// reasoning as /sw-register.js.
(function () {
  try {
    var t = localStorage.getItem("sentinel-theme");
    var valid = ["light", "dark", "coral", "light-blue", "gray"];
    if (valid.indexOf(t) < 0) t = "dark";
    if (t !== "light") document.documentElement.classList.add(t);
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
