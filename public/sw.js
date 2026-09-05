const CACHE_NAME = "hamrah-shell-v5";
const CORE_ASSETS = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];
const IS_LOCAL_DEVELOPMENT = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

self.addEventListener("install", (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith("hamrah-shell-") && (IS_LOCAL_DEVELOPMENT || key !== CACHE_NAME))
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // A cached development page can look healthy after `next dev` stops while
  // none of its React controls are hydrated. Never serve that misleading shell.
  if (IS_LOCAL_DEVELOPMENT) return;

  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        if (response.ok) void cache.put(request, response.clone());
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      const cache = await caches.open(CACHE_NAME);
      void cache.put(request, response.clone());
      return response;
    } catch {
      return (await caches.match(request)) || Response.error();
    }
  })());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "همراه", {
    body: data.body || "یک یادآوری تازه داری",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: data.url || "/" },
    tag: data.tag || "hamrah-reminder",
    requireInteraction: Boolean(data.urgent),
    renotify: Boolean(data.urgent),
    vibrate: data.urgent ? [300, 150, 300, 150, 500] : [180, 100, 180],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
