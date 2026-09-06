/**
 * Which UPI app to hand an iPhone's payment to.
 *
 * Android needs none of this — `upi://` opens the system chooser, which lists
 * whatever is installed and remembers the pick itself. iOS has no such
 * mechanism: it never registered `upi://` system-wide, and a web page cannot
 * ask it which apps exist. So the choosing has to happen in the page, and the
 * remembering with it.
 *
 * Every scheme below is a best effort. A browser cannot test whether a scheme
 * has a handler — tapping either opens the app or silently does nothing — so
 * the screen keeps the QR and the copyable address underneath, always, and
 * offers a way to pick a different app when one turns out to be a dead end.
 * That is the honest shape for a list nobody can verify from here.
 */

const STORE = "iimpresent.upi.app";

/**
 * The apps worth offering, most-used first.
 *
 * Each takes the same UPI query string; only the scheme differs. Every one is
 * a best effort — a web page cannot ask iOS whether a scheme has a handler —
 * so the screen is built so that a dead one costs a tap and nothing else.
 */
export const UPI_APPS = [
  { id: "gpay", name: "Google Pay", scheme: "gpay://upi/pay?",
    android: "com.google.android.apps.nbu.paisa.user" },
  { id: "phonepe", name: "PhonePe", scheme: "phonepe://pay?",
    android: "com.phonepe.app" },
  { id: "paytm", name: "Paytm", scheme: "paytmmp://pay?",
    android: "net.one97.paytm" },
];

export const appById = (id) => UPI_APPS.find((a) => a.id === id) ?? null;

/**
 * Re-address a `upi://pay?…` link at one app.
 *
 * The query is carried across untouched either way, so the payee and the
 * amount can never drift between the generic link and an app-specific one.
 *
 * The two platforms need different constructions for the same intention:
 *
 *   Android   `intent://…;package=…;end` names the app to Chrome, and — the
 *             reason it is here — bypasses the system default. A phone whose
 *             default UPI handler is WhatsApp sends every plain `upi://` link
 *             there without showing a chooser; this goes where it is told.
 *
 *   iOS       the app's own scheme, because there is no chooser to bypass and
 *             no intent syntax to use.
 */
export function forApp(upiLink, appId, { android = false } = {}) {
  const app = appById(appId);
  if (!upiLink || !app) return upiLink ?? null;
  const query = upiLink.replace(/^upi:\/\/pay\?/, "");
  return android
    ? `intent://pay?${query}#Intent;scheme=upi;package=${app.android};end`
    : app.scheme + query;
}

/**
 * The remembered app.
 *
 * Kept per device rather than per shop: which UPI app somebody uses is a fact
 * about them, not about the counter they are paying. Kept in localStorage
 * rather than with the basket, so it outlives the order — the whole point is
 * not being asked again.
 *
 * An id that is no longer offered reads as nothing, so removing an app from
 * the list above cannot strand somebody on a button that goes nowhere.
 */
export function rememberedApp() {
  try {
    return appById(localStorage.getItem(STORE))?.id ?? null;
  } catch {
    return null;
  }
}

export function rememberApp(appId) {
  try {
    if (appById(appId)) localStorage.setItem(STORE, appId);
  } catch {
    /* a private window; they will be asked again, which is survivable */
  }
  return appById(appId)?.id ?? null;
}

export function forgetApp() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
  return null;
}
