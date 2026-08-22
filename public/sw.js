// RollCall service worker — app shell cache + push delivery.

const CACHE = "rollcall-v13";
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
        ? [data.body, data.subhint].filter(Boolean).join(" · ")
        : [data.body, data.hint].filter(Boolean).join(" · "),
      icon: "/icon-192.png",
      badge: "/icon-badge.png",
      tag: data.classId ? `class-${data.classId}-${data.classDate}` : "rollcall",
      data,
      // Deliberately one button, not two.
      //
      // `event.action` is the only signal the API gives about which button was
      // pressed, and on at least one Android build it reports the second
      // action for a press on the first. With two buttons that silently
      // records the opposite of what the student chose. With one, any action
      // at all can only mean this one — a misreported id has nowhere wrong to
      // land.
      //
      // Present is the button worth having: most classes are attended, so the
      // common case is one tap. Missing a class is the exception and goes
      // through the app, where it can't be recorded by mistake.
      actions: [{ action: "present", title: "Mark present" }],
    }),
  );
});

/** Bring the app forward, reusing an open window where there is one. */
async function openApp(target) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of list) {
    if ("focus" in client) {
      // navigate() is missing or throws in some engines; focusing the existing
      // window still beats spawning a second one.
      try {
        if ("navigate" in client) await client.navigate(target);
      } catch (err) {
        console.warn("navigate failed", err);
      }
      return client.focus();
    }
  }
  return self.clients.openWindow(target);
}

/** Tell any open window to refresh, so a mark made here shows up there. */
async function nudgeOpenWindows() {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of list) {
    try {
      client.postMessage({ type: "attendance-changed" });
    } catch {
      /* a window that has gone away is not a problem */
    }
  }
}

// SW_BUILD is echoed in the confirmation so there is no doubt about which
// version of this file the browser is actually running. A stale worker looks
// exactly like a logic bug from the outside.
const SW_BUILD = "v13";

async function toast(title, body, { sticky = false } = {}) {
  await self.registration.showNotification(title, {
    body: `${body}${body ? " · " : ""}sw ${SW_BUILD}`,
    icon: "/icon-192.png",
    badge: "/icon-badge.png",
    tag: "rollcall-ack",
    silent: true,
    // Stays put while this is being diagnosed, so the detail can be read
    // rather than vanishing after four seconds.
    requireInteraction: sticky,
  });
  if (sticky) return;
  await new Promise((r) => setTimeout(r, 4000));
  const shown = await self.registration.getNotifications({ tag: "rollcall-ack" });
  shown.forEach((n) => n.close());
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const { classId, classDate, test, markToken, markUrl, title } = data;

  if (test) {
    event.waitUntil(openApp("/"));
    return;
  }

  // Captured synchronously and verbatim. Reported below exactly as the
  // browser gave it, because interpreting it first is what hid the fault.
  const rawAction = event.action;

  // Kept in the console only: this device has been seen reporting the wrong
  // action id, so the raw value is worth having if anything looks off again.
  console.log("notificationclick", {
    rawAction,
    registered: (event.notification.actions || []).map((a) => a.action),
    tag: event.notification.tag,
  });

  // With a single registered action, any non-empty action means that button.
  // The id itself is not trusted — only whether one was pressed at all.
  const registered = event.notification.actions || [];
  const status = rawAction && registered.length === 1 ? "present" : null;

  // Tapping the body opens the app on Today, where the class is at the top
  // with Present / Absent / Cancelled next to it. That is the route for
  // marking absent, so it should land somewhere useful rather than the app's
  // front door.
  if (!status) {
    event.waitUntil(openApp("/?focus=today"));
    return;
  }

  event.waitUntil((async () => {
    // The push carries a token authorising this one session, so the mark can
    // be written from here — no session, no app launch, no context switch.
    if (markToken && markUrl) {
      try {
        const res = await fetch(markUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: markToken, status }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          await nudgeOpenWindows();
          // Report what the server says it stored, not what this worker
          // intended. If the two ever disagree, the message shows it rather
          // than hiding it behind an optimistic label.
          const saved = body?.status ?? status;
          await toast(
            saved === "present" ? "Marked present"
              : saved === "absent" ? "Marked absent"
              : `Marked ${saved}`,
            // Deliberately noisy while this is being diagnosed: the button the
            // browser says was pressed, what was sent, and what came back.
            [title, body?.startTime].filter(Boolean).join(" · "),
          );
          return;
        }
        console.warn("mark failed", res.status, body);
        await toast("Couldn't save that", body?.error || `Error ${res.status}`);
        return;
      } catch (err) {
        console.warn("mark request failed", err);
      }
    }

    // Offline, expired, or an older alert with no token: fall back to handing
    // the intent to the app, which applies it on load.
    await openApp(
      classId ? `/?mark=${classId}&date=${classDate}&status=${status}` : "/",
    );
  })());
});