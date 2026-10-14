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
  type Datewise, datewiseAgrees, DW_SUBJECT, DW_TERM, formAction, GRID_ID, hasOtpField,
  hasPasswordBox, LOGIN_BUTTON, LOGOFF_BUTTON, matchSubject, postBackFields, readDatewise,
  readGrid, selectOptions, TERM_SELECT, termKey, USERNAME,
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

/** One course's dates, or why they couldn't be read. A failure here never
 *  fails the read: the term's totals are still worth having. */
export type DatewiseResult = (Datewise & { agrees: boolean }) | { error: string };

export interface OltAttendance {
  term: string | null;
  terms: string[];
  columns: string[];
  rows: string[][];
  datewise: Record<string, DatewiseResult>; // keyed by the term table's course name
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
  /** Which step is running, for the log. "OLT answered 500" alone could be
   *  any of four requests. */
  step = "start";

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
      throw new OltError("unreachable", `Couldn't reach OLT (${(err as Error).name}) at ${this.step}.`);
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
      throw new OltError("unreachable", `OLT answered ${res.status} at ${this.step}.`);
    }

    this.last = { url, html: await res.text() };
    return this.last;
  }

  /** Posts the page's form back as if `target` had been clicked. */
  postBack(page: Page, target: string, set: Record<string, string> = {}): Promise<Page> {
    return this.load(formAction(page.html, page.url), postBackFields(page.html, target, set));
  }

  /** Presses OLT's own "Sign off". Best effort: failing to sign out must not
   *  fail a read that worked. */
  async signOut() {
    if (!this.last || hasPasswordBox(this.last.html)) return;
    try {
      this.step = "signing off";
      await this.postBack(this.last, LOGOFF_BUTTON);
    } catch { /* already gone */ }
  }
}

async function signIn(session: Session, loginId: string, password: string): Promise<void> {
  session.step = "the sign-in page";
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

  session.step = "signing in";
  const after = await session.postBack(page, LOGIN_BUTTON, {
    [USERNAME]: loginId,
    [passName]: password,
  });

  if (hasPasswordBox(after.html)) throw new OltError("bad_password", "OLT didn't accept that password.");
  if (hasOtpField(after.html)) throw new OltError("otp_required", "OLT asked for a one-time code.");
}

/**
 * The "Datewise Attendance" section, for each course in the term table.
 *
 * Its own term picker first (it is independent of the table above and can sit
 * on another term), then each course in turn. Only the student's own courses
 * are asked for: the picker lists every course in the term, thirty-odd, and
 * reading them all would be thirty-odd requests for nothing.
 *
 * Every step is checked the way the term table is — the picker must say it is
 * showing what was asked for — and a course that can't be read gets a reason
 * rather than a guess.
 */
async function readAllDatewise(
  session: Session,
  page: Page,
  termText: string,
  grid: { columns: string[]; rows: string[][] },
): Promise<Record<string, DatewiseResult>> {
  const out: Record<string, DatewiseResult> = {};
  const col = (re: RegExp) => grid.columns.findIndex((c) => re.test(c));
  const subjectCol = Math.max(0, col(/subject|course/i));
  const attendedCol = col(/^attended$/i);
  const totalCol = col(/total/i);
  const courses = grid.rows.map((r) => r[subjectCol]).filter(Boolean);
  if (!courses.length) return out;

  const failAll = (error: string) => {
    for (const c of courses) if (!(c in out)) out[c] = { error };
    return out;
  };

  const dwTerm = selectOptions(page.html, DW_TERM)
    ?.find((o) => o.value && termKey(o.text) === termKey(termText));
  if (!dwTerm) return failAll("OLT's date-wise section doesn't list this term.");

  try {
    session.step = `date-wise ${termText}`;
    page = await session.postBack(page, DW_TERM, { [DW_TERM]: dwTerm.value });
  } catch (err) {
    return failAll(`Couldn't open OLT's date-wise section (${(err as Error).message}).`);
  }
  const shownTerm = selectOptions(page.html, DW_TERM)?.find((o) => o.selected);
  if (!shownTerm || termKey(shownTerm.text) !== termKey(termText)) {
    return failAll("OLT's date-wise section showed a different term.");
  }

  for (const row of grid.rows) {
    const course = row[subjectCol];
    if (!course) continue;
    const hits = matchSubject(selectOptions(page.html, DW_SUBJECT) ?? [], course);
    if (hits.length !== 1) {
      out[course] = {
        error: hits.length
          ? "OLT's date-wise section lists this course more than once."
          : "Couldn't find this course in OLT's date-wise section.",
      };
      continue;
    }

    try {
      session.step = `date-wise ${course}`;
      page = await session.postBack(page, DW_SUBJECT, { [DW_SUBJECT]: hits[0].value });
    } catch (err) {
      // OLT stopped answering. The rest would fail the same way, so say so
      // once for each of them rather than waiting out every timeout.
      return failAll(`OLT stopped answering (${(err as Error).message}).`);
    }

    const shown = selectOptions(page.html, DW_SUBJECT)?.find((o) => o.selected);
    if (!shown || shown.value !== hits[0].value) {
      out[course] = { error: "OLT showed a different course." };
      continue;
    }
    const dw = readDatewise(page.html);
    if (!dw) {
      out[course] = { error: "OLT showed no dates for this course." };
      continue;
    }
    out[course] = {
      ...dw,
      agrees: datewiseAgrees(dw, row[attendedCol] ?? "", row[totalCol] ?? ""),
    };
  }
  return out;
}

export async function readAttendance(
  loginId: string,
  password: string,
  wantedTerm: string,
): Promise<OltAttendance> {
  const session = new Session();
  try {
    await signIn(session, loginId, password);

    session.step = "the attendance page";
    let page = await session.load(new URL(ATTENDANCE_PATH, BASE).toString());
    if (hasPasswordBox(page.html)) {
      throw new OltError("session_lost", "OLT signed in, then asked to sign in again.");
    }

    const options = selectOptions(page.html, TERM_SELECT)?.filter((o) => o.value) ?? [];
    if (!options.length) throw new OltError("no_term", "OLT's attendance page has no term picker.");
    const terms = options.map((o) => o.text);

    // Only ever the term the student asked for. OLT opens on a term of its
    // own choosing — Term-I, for a second year — so there is no default
    // here: reading "whatever OLT showed" once handed back the wrong term.
    const choice = options.find((o) => termKey(o.text) === termKey(wantedTerm));
    if (!choice) {
      throw new OltError("no_term", `OLT doesn't list ${wantedTerm}. It lists ${terms.join(", ")}.`);
    }

    // Picked every time, even when OLT already shows it, exactly as a
    // browser does: the picker posts back on change, named by itself.
    session.step = `picking ${choice.text}`;
    page = await session.postBack(page, TERM_SELECT, { [TERM_SELECT]: choice.value });

    // And confirmed: the page that came back must say it's showing that term.
    // A grid for another term, read as this one, is the one mistake that
    // can't be seen from the screen.
    const shown = selectOptions(page.html, TERM_SELECT)?.find((o) => o.selected);
    if (!shown || termKey(shown.text) !== termKey(choice.text)) {
      throw new OltError("no_term", `OLT showed ${shown?.text ?? "no term"} instead of ${choice.text}.`);
    }

    const grid = readGrid(page.html);
    if (!grid) throw new OltError("no_table", `OLT's attendance page had no ${GRID_ID}.`);

    const datewise = await readAllDatewise(session, page, choice.text, grid);

    return { term: choice.text, terms, ...grid, datewise };
  } finally {
    await session.signOut();
  }
}
