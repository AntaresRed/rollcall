// RollCall service worker — app shell cache + push delivery.

const CACHE = "rollcall-v1";
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Network-first for navigation so students always land on the latest build,
// falling back to cache when campus wifi drops.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* fall through to defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Class starting", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-badge.png",
      tag: data.classId ? `class-${data.classId}-${data.classDate}` : "rollcall",
      data,
      actions: [
        { action: "present", title: "Mark present" },
        { action: "open", title: "Open" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { classId, classDate } = event.notification.data || {};
  const target =
    event.action === "present" && classId
      ? `/?mark=${classId}&date=${classDate}`
      : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
