import { isIOS, isStandalone } from "./platform";

/**
 * Installing IIMPresent to the home screen.
 *
 * There is no way to raise the operating system's install dialog on arrival,
 * and that is deliberate on the browsers' part — every site would fire it on
 * load. What exists is narrower:
 *
 *   Chromium  fires `beforeinstallprompt` once it judges the app installable.
 *             Stash that event and it can be replayed later from a tap, which
 *             opens the real OS sheet. It cannot be summoned; if the browser
 *             never fires it, there is nothing to replay.
 *
 *   iOS       has no such event and never has. Share → Add to Home Screen,
 *             by hand, is the only route Apple provides. So on an iPhone the
 *             most honest thing a button can do is say where the control is.
 *
 * Which is why this reports a *route* rather than a boolean: the banner has to
 * say different true things on different phones.
 */

const DISMISSED = "iimpresent.install.dismissed";

/** How long a "not now" lasts. A day: long enough that dismissing it clears
 *  the screen for the session you are in, short enough that somebody who
 *  meant "not right this second" is asked again tomorrow. */
export const QUIET_DAYS = 1;

/** Pure, so the window itself is checkable without a browser or a clock. */
export function stillQuiet(at, now = new Date(), days = QUIET_DAYS) {
  if (!at) return false;
  const since = (now.getTime() - Number(at)) / 86400000;
  // A stamp from the future means a clock that has been moved; treat it as
  // spent rather than as a dismissal lasting until the clock catches up.
  if (since < 0) return false;
  return since < days;
}

export function installDismissed(now = new Date()) {
  try {
    return stillQuiet(Number(localStorage.getItem(DISMISSED)), now);
  } catch {
    return false;
  }
}

export function dismissInstall(now = new Date()) {
  try {
    localStorage.setItem(DISMISSED, String(now.getTime()));
  } catch {
    /* a private window; the banner comes back next time, which is survivable */
  }
}

/**
 * What the button can actually do here.
 *
 *   "prompt"   a stashed event is ready — tapping opens the OS install sheet
 *   "ios"      Share → Add to Home Screen, spelled out
 *   "manual"   installable in principle, but this browser has told us nothing;
 *              the menu is the only thing we can point at
 *   null       already installed, or nothing sensible to say
 */
export function installRoute({ deferred, installed, ios, standalone } = {}) {
  // Worked out in the body, never as default parameter values: those are
  // evaluated on every call whether or not the caller passed anything, and
  // both of these touch `window`. The smoke test renders without one.
  const here = typeof window !== "undefined";
  const put = standalone ?? (here ? isStandalone() : false);
  const apple = ios ?? (here ? isIOS() : false);

  if (installed || put) return null;
  if (deferred) return "prompt";
  if (apple) return "ios";
  return "manual";
}

/**
 * Firefox and, on iOS, every browser — they are all Safari underneath — have
 * no install sheet to open. Naming them keeps the instruction concrete
 * instead of "use your browser menu somehow".
 */
export function browserHint(ua) {
  ua = ua ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  if (/Firefox/.test(ua)) return "Firefox's menu, then Install";
  if (/Edg\//.test(ua)) return "Edge's menu, then Apps → Install this site";
  if (/Chrome|Chromium/.test(ua)) return "Chrome's menu, then Install app";
  return "your browser's menu, then Install";
}
