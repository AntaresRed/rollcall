/**
 * What kind of thing the app is running in.
 *
 * Its own file, with no imports, because the answers are needed by parts of
 * the app that have no business loading the Supabase client to get them —
 * the install banner renders before anybody has signed in, and pulling the
 * auth client in behind it meant a missing environment variable took the
 * whole screen out rather than one feature.
 */

/** Launched from the home screen rather than a browser tab. iOS only delivers
 *  push to PWAs opened this way, which is why it is worth knowing. */
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

/** Android, where a `upi://` link and an `intent://` URL both actually go
 *  somewhere. Everywhere else they are inert, so features that depend on them
 *  have to be able to say so rather than offering a button that does nothing. */
export function isAndroid() {
  return /android/i.test(navigator.userAgent);
}
