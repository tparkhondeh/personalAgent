importScripts('/pwa-recovery.js');
const CACHE_NAME = "hamrah-shell-v8-safe-recovery";
const CORE_ASSETS = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];
const IS_LOCAL_DEVELOPMENT = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

self.addEventListener("install", (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    self.skipWaiting();
    return;
  }
  // Cache availability must never prevent installing the self-contained recovery.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Preserve legacy caches/data. They are not trusted as an interactive fallback.
  event.waitUntil(self.clients.claim());
});

function recovery() {
  return new Response(self.TIA_RECOVERY_PAGE, { status: 503, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': self.TIA_RECOVERY_CSP, 'X-Content-Type-Options': 'nosniff',
  }});
}

self.addEventListener("fetch", (event) => {
  // A cached development page can look healthy after `next dev` stops while
  // none of its React controls are hydrated. Never serve that misleading shell.
  if (IS_LOCAL_DEVELOPMENT) return;

  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.startsWith("/api/")) return;
  // Next RSC/prefetch responses must never replace a cached HTML document.
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        return response.status >= 500 ? recovery() : response;
      } catch {
        return recovery();
      }
    })());
    return;
  }

  // Only immutable/static assets may fall back, never account documents, RSC or APIs.
  if (!url.pathname.startsWith('/_next/static/') && !url.pathname.startsWith('/speech/') && !CORE_ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined));
      }
      return response;
    } catch {
      try { return (await caches.open(CACHE_NAME).then(cache => cache.match(request))) || Response.error(); }
      catch { return Response.error(); }
    }
  })());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "tia", {
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
