// watchparty service worker — web push only (no fetch interception, so it
// never gets between the app and the network).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
    if (!event.data) return;
    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: "watchparty", body: event.data.text() };
    }
    const { title, body, url, tag } = payload;
    event.waitUntil(
        self.registration.showNotification(title || "watchparty", {
            body: body || "",
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: tag || undefined, // same tag replaces instead of stacking
            data: { url: url || "/" },
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "/";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
            for (const client of windows) {
                if (new URL(client.url).origin === self.location.origin && "focus" in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            return self.clients.openWindow(url);
        }),
    );
});
