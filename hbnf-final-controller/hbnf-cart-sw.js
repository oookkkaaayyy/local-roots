/* HBNF owner PWA app-shell reliability cache. Never caches control/API traffic. */
const CACHE_PREFIX = "hbnf-owner-pwa-";
const CACHE_NAME = "hbnf-owner-pwa-v7-3-r1-20261006";
const VERSION = "20261006-skins-owner-pwa-r1";
const APP_FALLBACK = `/hbnf-cart.html?app=${VERSION}`;
const CORE = [
  APP_FALLBACK,
  `/hbnf-cart.js?v=${VERSION}`,
  `/hbnf-cart-net.mjs?v=${VERSION}`,
  `/hbnf-cart-semantic.mjs?v=${VERSION}`,
  `/hbnf-cart-ui-v6.css?v=${VERSION}`,
  `/hbnf-cart-ui-v6.mjs?v=${VERSION}`,
  `/hbnf-cart-features.mjs?v=${VERSION}`,
  `/hbnf-cart-skins-score.mjs?v=${VERSION}`,
  `/hbnf-cart-manifest.webmanifest?v=${VERSION}`,
  `/hbnf-cart-icon-180.png?v=${VERSION}`,
  `/hbnf-cart-icon-192.png?v=${VERSION}`,
  `/hbnf-cart-icon-512.png?v=${VERSION}`,
];
const ASSET_PATHS = new Set(CORE.map(value => new URL(value, self.location.origin).pathname));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function fetchWithTimeout(request, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("network-timeout")), timeoutMs);
  });
  try { return await Promise.race([fetch(request), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetchWithTimeout(request, 3500);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request, { ignoreSearch: true })) ||
      (fallbackKey ? await cache.match(fallbackKey) : undefined) ||
      Response.error();
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (!request || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === "/hbnf-cart.html") {
    event.respondWith(networkFirst(request, APP_FALLBACK));
    return;
  }
  if (ASSET_PATHS.has(url.pathname)) event.respondWith(networkFirst(request));
});
