import { supabase } from "./supabase";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iOS only delivers push to PWAs launched from the home screen. */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("service worker registration failed", err);
    return null;
  }
}

/**
 * `navigator.serviceWorker.ready` never rejects — if registration failed it
 * simply hangs forever, which would freeze the app on its loading spinner.
 * Always race it.
 */
function readyWithin(ms = 5000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Ask for permission, subscribe, and store the subscription so the alert
 * sweep can reach this device. Returns a plain status string for the UI.
 */
export async function enableAlerts() {
  if (!pushSupported()) return "unsupported";
  if (!VAPID_PUBLIC) {
    console.error("VITE_VAPID_PUBLIC_KEY is not set in this build");
    return "misconfigured";
  }
  if (isIOS() && !isStandalone()) return "needs-install";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await readyWithin();
  if (!reg) return "unsupported";
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  const json = sub.toJSON();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      timezone,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;

  await supabase.from("profiles").update({ timezone }).eq("id", user.id);
  return "enabled";
}

export async function alertsActive() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await readyWithin();
  if (!reg) return false;
  return Boolean(await reg.pushManager.getSubscription());
}

/**
 * Fire a notification locally, right now, with the same options a real class
 * alert uses.
 *
 * This separates two failures that look identical from the outside: the push
 * never arriving, and the push arriving but the device not rendering action
 * buttons. It also reports what the browser says it supports, which is the
 * only reliable answer — `Notification.maxActions` is 2 on Chrome, 0 on
 * Firefox and iOS Safari.
 */
export async function sendTestNotification() {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (Notification.permission !== "granted") return { ok: false, reason: "denied" };

  const reg = await readyWithin();
  if (!reg) return { ok: false, reason: "no-service-worker" };

  const maxActions = Notification.maxActions ?? 0;

  await reg.showNotification("Test alert", {
    body: maxActions > 0
      ? "Buttons below? Then class alerts will work."
      : "This browser shows no buttons — tap the alert itself to mark attendance.",
    icon: "/icon-192.png",
    badge: "/icon-badge.png",
    tag: "rollcall-test",
    requireInteraction: true,
    data: { test: true },
    actions: [
      { action: "present", title: "Present" },
      { action: "absent", title: "Absent" },
    ],
  });

  // The registration is the source of truth for which script is live — a
  // stale service worker is the usual reason buttons don't appear.
  const scriptUrl = reg.active?.scriptURL ?? "unknown";
  return { ok: true, maxActions, scriptUrl };
}