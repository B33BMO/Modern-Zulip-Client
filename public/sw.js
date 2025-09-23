const IMG_CACHE = "img-v1";
const IMG_PREFIX = "/api/zulip/proxy?path=";
// Paths we want CacheFirst (rarely change) vs SWR (sometimes change)
const CACHE_FIRST = [/^\/user_avatars\//, /^\/static\//];
const STALE_REVAL = [/^\/user_uploads\//, /^\/external_content\//, /^\/user_uploads\/thumbnail\//];

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// Simple router
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/api/zulip/proxy")) return;

  const path = url.searchParams.get("path") || "";
  const strategy = (reArr) => reArr.some(re => re.test(path));

  // choose strategy
  if (strategy(CACHE_FIRST)) {
    event.respondWith(cacheFirst(event.request));
  } else if (strategy(STALE_REVAL)) {
    event.respondWith(staleWhileRevalidate(event.request));
  } else {
    // default SWR for other proxied assets too
    event.respondWith(staleWhileRevalidate(event.request));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req, { ignoreVary: true, ignoreSearch: false });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req, { ignoreVary: true, ignoreSearch: false });
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  return hit || net;
}
