/* No offline cache: private account and order pages must always use the server. */
self.addEventListener("push", event => {
  let data = { title: "Azumi", body: "Hay novedades de tus pedidos.", url: "/pedidos", tag: "azumi" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* Use the fallback notification. */ }
  event.waitUntil(Promise.all([self.registration.showNotification(data.title, { body: data.body, tag: data.tag, icon: "/icon", badge: "/icon", data: { url: data.url } }), self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => { for (const client of clients) client.postMessage({ type: "azumi-order-update" }); })]));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/pedidos", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    for (const client of clients) { if ("navigate" in client) { await client.navigate(target.href); return client.focus(); } }
    return self.clients.openWindow(target.href);
  }));
});
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
