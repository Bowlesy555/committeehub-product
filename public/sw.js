const CACHE_NAME = "committeehub-shell-v1";
const SHELL_ASSETS = ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first, always -- this is a realtime/collaborative app, so serving
// a stale cached page or a stale API response would be actively wrong, not
// just outdated. The cache here exists only to satisfy PWA installability
// and give the shell icons a fallback if briefly offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// ---- Push notifications -------------------------------------------------
// The server sends { title, body, url, tag }. If the app is already open and
// visible the in-app dots and sound cover it, so nothing extra is shown --
// except on iPhone/iPad, where every push must produce a visible notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "CommitteeHub";
  const ios = /iPhone|iPad|iPod/.test(self.navigator.userAgent);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const visible = list.some((c) => c.visibilityState === "visible");
      if (visible && !ios) return undefined;
      return self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icon-192.png",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: { url: data.url || "/dashboard" },
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
