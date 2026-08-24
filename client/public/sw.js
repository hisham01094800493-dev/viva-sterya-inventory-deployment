const CACHE_NAME = "smart-inventory-shell-v4";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/manus-storage/logo_53a99136.png"];
const CACHEABLE_DESTINATIONS = new Set(["document", "script", "style", "image", "font"]);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && CACHEABLE_DESTINATIONS.has(request.destination)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.destination === "document") {
          return (await caches.match("/index.html")) || (await caches.match("/")) || new Response("التطبيق غير متاح دون اتصال", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
        return new Response("المورد غير متاح دون اتصال", { status: 503 });
      }),
  );
});
