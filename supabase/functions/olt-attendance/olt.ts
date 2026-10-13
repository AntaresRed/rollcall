// ============================================================
// A minimal OLT client: sign in, open Attendance, pick a term, read the table.
//
// OLT is an ASP.NET WebForms site. Every page is one <form> whose state rides
// in hidden fields (__VIEWSTATE, __EVENTVALIDATION, an anti-forgery token), and
// every button is a "postback": the same form posted back with __EVENTTARGET
// naming the control that was clicked. So the client below does what a browser
// does — carry the cookies, resend every field the page handed out, and set
// __EVENTTARGET — and never constructs any of that state itself.
//
// The page reading lives in parse.ts, which is tested; this file is the
// network half, which can only be tried against OLT itself.
// ============================================================

import {
  formAction, formFields, GRID_ID, hasOtpField, hasPasswordBox, LOGIN_BUTTON,
  LOGOFF_BUTTON, readGrid, selectOptions, TERM_SELECT, termKey, USERNAME,
} from "./parse.ts";

const BASE = "https://olt.iimcal.ac.in/";
const LOGIN_PATH = "default?typeid=0"; // typeid 0 is the "Student" button
const ATTENDANCE_PATH = "StudentAttendance";
const TIMEOUT_MS = 20_000;

// Says who is asking. An institute admin reading their logs should be able to
// tell these requests from a person's, and from anything pretending to be one.
const USER_AGENT = "IIMPresent/1.0 (student attendance sync)";

export type OltErrorCode =
  | "unreachable"   // network failure, timeout, or a page that isn't OLT's
  | "bad_password"  // OLT showed the sign-in form again
  | "otp_required"  // sign-in wants a second step we can't answer
  | "session_lost"  // signed in, then sent back to sign-in on the next page
  | "no_term"       // no term picker, or no term matching the request
  | "no_table";     // the attendance grid wasn't on the page

export class OltError extends Error {
  constructor(public code: OltErrorCode, message: string) {
    super(message);
  }
}

export interface OltAttendance {
  term: string | null;
  terms: string[];
  columns: string[];
  rows: string[][];
}

interface Page {
  url: string;
  html: string;
}

/** Cookies by name, enough for one sign-in. Path and expiry are ignored: the
 *  session lasts a few requests and only ever talks to one host. */
class Session {
  private cookies = new Map<string, string>();
  /** The last page loaded, whose form the sign-off posts back. */
  last: Page | null = null;

  private remember(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", USER_AGENT);
    if (this.cookies.size) {
      headers.set("Cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    try {
      return await fetch(url, {
        ...init,
        headers,
        // Followed by hand: the sign-in cookie arrives on the 302 itself, and
        // an automatic redirect would drop it on the floor.
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new OltError("unreachable", `Couldn't reach OLT (${(err as Error).name}).`);
    }
  }

  /** GET, or POST a form, following redirects to the page it lands on. */
  async load(url: string, form?: [string, string][]): Promise<Page> {
    let res = await this.fetch(url, form
      ? {
        method: "POST",
        body: new URLSearchParams(form),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
      : {});
    this.remember(res);

    for (let hops = 0; res.status >= 300 && res.status < 400; hops++) {
      const next = res.headers.get("location");
      if (!next || hops > 5) break;
      await res.body?.cancel();
      url = new URL(next, url).toString();
      res = await this.fetch(url);
      this.remember(res);
    }

    if (!res.ok) {
      await res.body?.cancel();
      throw new OltError("unreachable", `OLT answered ${res.status}.`);
    }

    this.last = { url, html: await res.text() };
    return this.last;
  }

  /** Posts the page's form back as if `target` had been clicked. */
  postBack(page: Page, target: string, set: Record<string, string> = {}): Promise<Page> {
    const fields = formFields(page.html).filter(([k]) => !(k in set) && !k.startsWith("__EVENT"));
    fields.push(...Object.entries(set), ["__EVENTTARGET", target], ["__EVENTARGUMENT", ""]);
    return this.load(formAction(page.html, page.url), fields);
  }

  /** Presses OLT's own "Sign off". Best effort: failing to sign out must not
   *  fail a read that worked. */
  async signOut() {
    if (!this.last || hasPasswordBox(this.last.html)) return;
    try {
      await this.postBack(this.last, LOGOFF_BUTTON);
    } catch { /* already gone */ }
  }
}

async function signIn(session: Session, loginId: string, password: string): Promise<void> {
  const page = await session.load(new URL(LOGIN_PATH, BASE).toString());
  if (!hasPasswordBox(page.html) || !page.html.includes(`name="${USERNAME}"`)) {
    throw new OltError("unreachable", "OLT's sign-in form has changed.");
  }

  // The password box's name, read rather than assumed: it is the one field on
  // the form whose id was hand-set ("Password"), so its name is the likelier
  // of the two to move.
  const passName = page.html.match(/<input\b[^>]*type="password"[^>]*>/i)?.[0]
    .match(/name="([^"]+)"/)?.[1];
  if (!passName) throw new OltError("unreachable", "OLT's sign-in form has changed.");

  const after = await session.postBack(page, LOGIN_BUTTON, {
    [USERNAME]: loginId,
    [passName]: password,
  });

  if (hasPasswordBox(after.html)) throw new OltError("bad_password", "OLT didn't accept that password.");
  if (hasOtpField(after.html)) throw new OltError("otp_required", "OLT asked for a one-time code.");
}

export async function readAttendance(
  loginId: string,
  password: string,
  wantedTerm?: string | null,
): Promise<OltAttendance> {
  const session = new Session();
  try {
    await signIn(session, loginId, password);

    let page = await session.load(new URL(ATTENDANCE_PATH, BASE).toString());
    if (hasPasswordBox(page.html)) {
      throw new OltError("session_lost", "OLT signed in, then asked to sign in again.");
    }

    const options = selectOptions(page.html, TERM_SELECT)?.filter((o) => o.value) ?? [];
    if (!options.length) throw new OltError("no_term", "OLT's attendance page has no term picker.");
    const current = options.find((o) => o.selected);

    // The term asked for; else whatever OLT already shows, which is the
    // current term; else the last one listed, the newest.
    const choice = wantedTerm
      ? options.find((o) => termKey(o.text) === termKey(wantedTerm))
      : current ?? options.at(-1);
    if (!choice) {
      throw new OltError("no_term", `OLT doesn't list "${wantedTerm}".`);
    }

    // The picker posts back on change, named by itself, exactly as picking
    // from it in a browser does. Skipped when the page already shows it.
    if (choice !== current || !readGrid(page.html)) {
      page = await session.postBack(page, TERM_SELECT, { [TERM_SELECT]: choice.value });
    }

    const grid = readGrid(page.html);
    if (!grid) throw new OltError("no_table", `OLT's attendance page had no ${GRID_ID}.`);

    return { term: choice.text, terms: options.map((o) => o.text), ...grid };
  } finally {
    await session.signOut();
  }
}
