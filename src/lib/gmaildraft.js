/**
 * The leave mail as a Gmail draft: addressed, written, the form attached,
 * waiting in the student's own Drafts for them to press Send.
 *
 * A link cannot attach a file, and the share sheet cannot address a mail, so
 * the only way to hand over all of it at once is Gmail's own API. That needs
 * the student's permission — `gmail.compose`, which Google shows as "manage
 * drafts and send emails" — and so it is asked for only when the student taps
 * for a draft, never at sign-in.
 *
 * Browser only, by design. Google's token comes back in the address bar of
 * public/gmail-callback.html, lives in sessionStorage for its hour, and is
 * used from this page straight against Gmail. No server sees it or the mail,
 * which is what keeps this permission from becoming a store of everybody's
 * mailbox access.
 *
 * The redirect rather than Google's popup: a popup from an app installed to
 * the iPhone Home Screen is the case most likely to go wrong.
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const TOKEN = "iimpresent.gmail.token";      // { token, expiresAt, email }
const STATE = "iimpresent.gmail.state";      // the round trip's nonce
const PENDING = "iimpresent.gmail.pending";  // a draft was asked for before the redirect
const CALLBACK = "iimpresent.gmail.callback"; // raw fragment, left by the callback page
const DRAFT = "iimpresent.gmail.draft";      // { draftId, messageId, key } this session

/* ---------- storage, inside try: the accessor itself can throw ---------- */

const session = () => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};
const get = (key) => {
  try {
    return JSON.parse(session()?.getItem(key) || "null");
  } catch {
    return null;
  }
};
const put = (key, value) => {
  try {
    if (value == null) session()?.removeItem(key);
    else session()?.setItem(key, JSON.stringify(value));
  } catch {
    /* a private window: the draft still works, it just asks Google again */
  }
};

/* ---------- the round trip to Google ---------- */

export const callbackUrl = (origin) => `${origin}/gmail-callback.html`;

/**
 * Google's permission page. `login_hint` puts the institute account first,
 * so a student signed into a personal Gmail as well is not asked to pick —
 * and the draft lands in the account the leave mail has to come from.
 */
export function authUrl({ clientId, redirectUri, email, state }) {
  const p = [
    ["client_id", clientId],
    ["redirect_uri", redirectUri],
    ["response_type", "token"],
    ["scope", GMAIL_SCOPE],
    ["include_granted_scopes", "true"],
    ["state", state],
    ...(email ? [["login_hint", email]] : []),
  ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `${AUTH}?${p}`;
}

/** Leave for Google. Everything the form holds is already in storage. */
export function askGoogle(email) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  put(STATE, state);
  put(PENDING, { email, at: Date.now() });
  window.location.assign(authUrl({
    clientId: GOOGLE_CLIENT_ID, redirectUri: callbackUrl(window.location.origin), email, state,
  }));
}

/**
 * What Google sent back, from the fragment the callback page stored.
 *
 * The state has to match the one this tab sent, or the token is refused: a
 * page anywhere could otherwise send a student to the callback with a token
 * for some other account, and the leave mail would be drafted into it.
 */
export function readCallback(fragment, expectedState, now = Date.now()) {
  const p = new URLSearchParams(String(fragment ?? "").replace(/^#/, ""));
  if (!expectedState || p.get("state") !== expectedState) return { error: "state" };
  if (p.get("error")) return { error: p.get("error") };
  const token = p.get("access_token");
  if (!token) return { error: "no_token" };
  // A minute short of what Google says, so a token is never used in the
  // seconds it is expiring.
  const life = Number(p.get("expires_in")) || 3600;
  return { token, expiresAt: now + (life - 60) * 1000 };
}

/**
 * Called when the screen opens. Returns what the round trip left:
 *   { pending: false }                    nothing was asked for
 *   { pending: true, error }              Google said no, or the trip was bad
 *   { pending: true }                     a token is ready and a draft owed
 * The callback is consumed either way, so a reload can't replay it.
 *
 * Held for the page's life until finishRoundTrip(), because React's
 * development checks build a screen twice — the second build must see the
 * same answer, not storage the first one already emptied.
 */
let held = null;
export function takeRoundTrip(now = Date.now()) {
  if (!held) held = readRoundTrip(now);
  return held;
}

/** The owed draft was made, or its error shown — don't act on it again. */
export function finishRoundTrip() {
  held = { pending: false };
}

function readRoundTrip(now) {
  const pending = get(PENDING);
  const fragment = get(CALLBACK);
  const state = get(STATE);
  put(CALLBACK, null);
  put(STATE, null);
  put(PENDING, null);
  // A pending ask older than ten minutes is a trip abandoned, not one
  // returning — don't make a draft nobody is waiting for.
  if (!pending || now - pending.at > 10 * 60_000) return { pending: false };
  if (fragment == null) return { pending: true, error: "no_callback" };
  const got = readCallback(fragment, state, now);
  if (got.error) return { pending: true, error: got.error };
  put(TOKEN, { token: got.token, expiresAt: got.expiresAt, email: pending.email });
  return { pending: true };
}

/** A token still good for this account, or null. */
export function heldToken(email, now = Date.now()) {
  const t = get(TOKEN);
  if (!t?.token || t.expiresAt <= now) return null;
  if (email && t.email && t.email !== email) return null;
  return t.token;
}

export const dropToken = () => put(TOKEN, null);

/* ---------- the mail itself ---------- */

const utf8 = (s) => new TextEncoder().encode(String(s ?? ""));

function base64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Base64 broken into 76-character lines, as MIME asks. */
const wrapped = (bytes) => base64(bytes).replace(/.{76}(?=.)/g, "$&\r\n");

/** A header value that may hold more than ASCII — the subject's en dash. */
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(utf8(s))}?=`);

/**
 * The attachment's name both ways: plain ASCII for any client, and the exact
 * name for the ones that read RFC 2231 — Gmail does.
 */
function filenames(name) {
  const plain = String(name).replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const exact = encodeURIComponent(name)
    .replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return { plain, exact };
}

/**
 * The whole message as MIME: text and the form. Line endings are CRLF
 * throughout, and the boundary is checked against the content rather than
 * trusted to be unlikely.
 */
export function mimeMessage({ to, cc, subject, body, file }) {
  let boundary = "leave-mail-boundary";
  const text = wrapped(utf8(String(body ?? "").replace(/\r?\n/g, "\r\n")));
  const pdf = wrapped(file.bytes);
  while (text.includes(boundary) || pdf.includes(boundary)) boundary += "-x";
  const { plain, exact } = filenames(file.name);
  return [
    `To: ${to.join(", ")}`,
    ...(cc?.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: ${header(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    text,
    `--${boundary}`,
    `Content-Type: ${file.type || "application/pdf"}; name="${plain}"`,
    `Content-Disposition: attachment; filename="${plain}"; filename*=UTF-8''${exact}`,
    "Content-Transfer-Encoding: base64",
    "",
    pdf,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** What Gmail's `raw` field takes: the message in URL-safe base64. */
export const rawOf = (mime) =>
  base64(utf8(mime)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* ---------- Gmail ---------- */

class GmailError extends Error {
  constructor(status, message) {
    super(message || `Gmail answered ${status}`);
    this.status = status;
  }
}

async function call(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GmailError(res.status);
  return res.json();
}

/**
 * Put the mail in Drafts. A draft already made this session is updated rather
 * than joined by a second one — a student who fixes a date after drafting
 * should find one leave mail in Drafts, not two that disagree. If that draft
 * has gone (sent, or deleted in Gmail), a new one is made.
 */
export async function saveDraft(token, raw, key) {
  const before = get(DRAFT);
  if (before?.draftId) {
    try {
      const d = await call(token, "PUT", `/drafts/${encodeURIComponent(before.draftId)}`,
        { id: before.draftId, message: { raw } });
      const out = { draftId: d.id, messageId: d.message?.id ?? before.messageId, key };
      put(DRAFT, out);
      return out;
    } catch (err) {
      // Gone is expected — anything else (an expired token) is the caller's.
      if (!(err instanceof GmailError) || (err.status !== 404 && err.status !== 400)) throw err;
    }
  }
  const d = await call(token, "POST", "/drafts", { message: { raw } });
  const out = { draftId: d.id, messageId: d.message?.id ?? "", key };
  put(DRAFT, out);
  return out;
}

/** The draft made this session — for this form, or one since edited. */
export const lastDraft = () => get(DRAFT);

/**
 * Where "Open Gmail" goes. On a laptop, straight into the draft, in the
 * institute account. The phone apps have no link to one draft, so there it
 * opens the app and the screen says where to look.
 */
export function gmailOpenHref({ platform, email, messageId }) {
  if (platform === "ios") return "googlegmail://";
  if (platform === "android") {
    return "intent://#Intent;action=android.intent.action.MAIN;"
      + "category=android.intent.category.LAUNCHER;package=com.google.android.gm;end";
  }
  // `authuser`, as leaveGmailHref uses, not a /u/<address>/ path: Gmail
  // answers an encoded address in the path with "account temporarily
  // unavailable" (404).
  const who = email ? `?authuser=${encodeURIComponent(email)}` : "";
  return `https://mail.google.com/mail/${who}#drafts${messageId ? `?compose=${messageId}` : ""}`;
}
