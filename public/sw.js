// RollCall service worker — app shell cache + push delivery.

const CACHE = "rollcall-v6";
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

  // A push service can still deliver a queued alert after its TTL in some
  // edge cases. Showing "starts in 10 min" for a class that ended hours ago is
  // worse than showing nothing, so drop it. The spec requires a visible
  // notification for every push, hence the quiet silent fallback.
  if (data.expiresAt && Date.now() > data.expiresAt) {
    event.waitUntil(
      self.registration.showNotification("RollCall", {
        body: "A class alert arrived too late to be useful.",
        tag: "rollcall-stale",
        silent: true,
        requireInteraction: false,
      })
    );
    return;
  }

  // Notification.maxActions is 0 on iOS and Firefox; there, the buttons below
  // simply won't appear, so the body carries the instruction instead.
  const canAct = typeof Notification !== "undefined" && Notification.maxActions > 0;

  event.waitUntil(
    self.registration.showNotification(data.title || "Class starting", {
      body: canAct
        ? data.body || ""
        : [data.body, data.hint].filter(Boolean).join(" · "),
      icon: "/icon-192.png",
      badge: "/icon-badge.png",
      tag: data.classId ? `class-${data.classId}-${data.classDate}` : "rollcall",
      data,
      // Chrome shows at most two action buttons, and iOS shows none at all —
      // so these are a shortcut, never the only way to mark a class. Ignoring
      // the notification leaves the session in Catch up, which is exactly the
      // "I'll do it later" path.
      actions: [
        { action: "present", title: "Present" },
        { action: "absent", title: "Absent" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { classId, classDate } = event.notification.data || {};

  // The service worker has no Supabase session of its own, so it can't write
  // the mark directly. It hands the intent to the app via the URL instead,
  // which then applies it on load.
  const status = event.action === "present" || event.action === "absent"
    ? event.action
    : null;

  const target = status && classId
    ? `/?mark=${classId}&date=${classDate}&status=${status}`
    : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if ("focus" in client) {
          // navigate() is unavailable or throws in some engines; focusing the
          // existing window still beats spawning a second one.
          try {
            if ("navigate" in client) await client.navigate(target);
          } catch (err) {
            console.warn("navigate failed", err);
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});