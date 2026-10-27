const CACHE_NAME = "vedat-shell-v3";
const DATA_CACHE = "vedat-data-v1";
const SHELL_ASSETS = [
  "/",
  "/icons/favicon.png",
  "/icons/vedat-mark.svg",
  "/icons/vedat-192.png",
  "/icons/vedat-512.png",
];

/* Çevrimdışıyken okunabilsin diye yalnız bu uçların son yanıtı saklanır.
   Yazma istekleri (POST/PUT/DELETE) hiçbir zaman önbelleğe girmez. */
const READABLE_API = ["/api/dashboard", "/api/rent-increases"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Çıkışta cihazdaki finans verisi silinir.
self.addEventListener("message", (event) => {
  if (event.data === "clear-data") event.waitUntil(caches.delete(DATA_CACHE));
});

function cacheIfOk(cacheName, request, response) {
  if (!response || response.status !== 200 || response.type !== "basic") return;
  const copy = response.clone();
  caches.open(cacheName).then((cache) => cache.put(request, copy));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    if (!READABLE_API.includes(url.pathname)) return;
    // Önce ağ; ağ yoksa son başarılı yanıt, "önbellekten" işaretiyle.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          cacheIfOk(DATA_CACHE, event.request, response);
          return response;
        })
        .catch(() =>
          caches.open(DATA_CACHE).then((cache) => cache.match(event.request)).then((cached) => {
            if (!cached) throw new Error("offline");
            const headers = new Headers(cached.headers);
            headers.set("x-from-cache", "1");
            return cached.blob().then((body) => new Response(body, { status: 200, headers }));
          })
        )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        cacheIfOk(CACHE_NAME, event.request, response);
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
