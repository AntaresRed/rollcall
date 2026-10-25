/**
 * Links that open a mail already addressed and written — for any mail the
 * app prepares. The leave mail has its own copies (leavemail.js) from before
 * there was a second mail; these are the same three, taking the addresses
 * as arguments rather than knowing them.
 *
 * encodeURIComponent throughout rather than URLSearchParams, which writes a
 * space as "+" — a space only by form-encoding convention, and a body full of
 * literal plus signs is not a risk worth taking on a mail to an office.
 */

const enc = encodeURIComponent;
const list = (xs) => (xs ?? []).join(",");

/** The phone's mail app. Line breaks as CRLF, as RFC 6068 asks. */
export function mailtoHref({ to, cc = [], subject, body }) {
  const q = [
    ...(cc.length ? [`cc=${enc(list(cc))}`] : []),
    `subject=${enc(subject)}`,
    `body=${enc(String(body ?? "").replace(/\n/g, "\r\n"))}`,
  ].join("&");
  return `mailto:${list(to)}?${q}`;
}

/** Gmail's compose window on the web, in the given account. */
export function gmailComposeHref({ to, cc = [], subject, body, email = "" }) {
  const p = [
    ...(email ? [["authuser", email]] : []),
    ["view", "cm"],
    ["fs", "1"],
    ["to", list(to)],
    ...(cc.length ? [["cc", list(cc)]] : []),
    ["su", subject],
    ["body", body],
  ].map(([k, v]) => `${k}=${enc(v)}`).join("&");
  return `https://mail.google.com/mail/?${p}`;
}

/** The Gmail app's own compose screen on iOS, past whatever the default
 *  mail app is. */
export function gmailAppHref({ to, cc = [], subject, body }) {
  const q = [
    `to=${enc(list(to))}`,
    ...(cc.length ? [`cc=${enc(list(cc))}`] : []),
    `subject=${enc(subject)}`,
    `body=${enc(body)}`,
  ].join("&");
  return `googlegmail://co?${q}`;
}
