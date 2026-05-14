// Bump CACHE_NAME on every change to force clients to drop stale caches.
// 2026-05-14: bumped to v3 alongside the Sentinel → Beacontry rebrand so
// every existing user gets a fresh cache (their offline page still says
// "Sentinel" until they reload at least once).
const CACHE_NAME = "beacontry-v3";
const STATIC_ASSETS = ["/dashboard/trader"];

// Returned whenever both network and cache miss. Without this, the previous
// version of the SW occasionally passed `undefined` to event.respondWith()
// — which throws "Failed to convert value to 'Response'" and surfaces as a
// FetchEvent rejection in DevTools.
function offlineFallback(request) {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("application/json") || request.url.includes("/api/")) {
    return new Response(
      JSON.stringify({ error: "Offline", offline: true }),
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Offline</title>" +
      "<style>body{font-family:system-ui;padding:40px;color:#aaa;background:#0a1112}</style>" +
      "<h1>Offline</h1><p>Beacontry can't reach the server. Reconnect and reload.</p>",
    {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

// Install — cache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for static, network-first for pages.
//
// Every branch guarantees a Response is passed to event.respondWith(). Never
// returns undefined (was the cause of "Failed to convert value to 'Response'"
// errors in v1).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls — always network. If network fails entirely (offline, DNS,
  // upstream crash), serve a synthesized 503 JSON instead of the previous
  // undefined-via-caches.match. A 5xx response is a Response — the SW
  // does NOT silently fail.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        return cached || offlineFallback(event.request);
      })
    );
    return;
  }

  // Static assets — cache first, fallback to network, fallback to offline.
  if (
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "image" ||
    event.request.destination === "font"
  ) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          // Only cache 2xx — caching error pages would poison subsequent loads.
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        } catch {
          return offlineFallback(event.request);
        }
      })
    );
    return;
  }

  // Pages — network first, cache fallback, then offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache only successful, basic-CORS responses. Caching opaque or
        // error responses can break HTML rendering on reload.
        if (res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || offlineFallback(event.request);
      })
  );
});
