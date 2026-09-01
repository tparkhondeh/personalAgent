self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("hamrah-shell-v3").then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("hamrah-shell-") && key !== "hamrah-shell-v3").map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin || new URL(request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open("hamrah-shell-v3").then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === "navigate" ? caches.match("/") : Response.error())));
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
