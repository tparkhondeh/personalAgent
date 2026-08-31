self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "همراه", {
    body: data.body || "یک یادآوری تازه داری",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: data.url || "/" },
    tag: data.tag || "hamrah-reminder",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
