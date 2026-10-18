// ============================================================
// POST /functions/v1/olt-attendance
//
// Reads a student's official attendance from OLT and keeps the latest copy in
// public.olt_attendance. Tester-only (profiles.is_tester).
//
// From the app, with the student's own session:
//   { action: "refresh", term, password }
//
// The OLT login ID is always the signed-in student's own address, never
// something the request names, so the function can only ever read the account
// of the person asking.
//
// The password is used for this one sign-in and never kept — not in the
// database, not in a log. Remembering it is the phone's job: the screen marks
// its fields so the phone's own password manager can save and fill them.
// (An earlier version saved it here, encrypted. It was dropped so that
// nobody, the project's owner included, holds students' passwords.)
//
//   supabase functions deploy olt-attendance --project-ref <ref>
// ============================================================

// Same pin as the other functions; see mark-attendance for why it's exact.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { OltError, readAttendance } from "./olt.ts";

const DOMAIN = "@email.iimcal.ac.in";

// No time limit between reads: nobody re-reads their attendance in a burst,
// and the screen disables its button while a read runs, which is what stops
// a double-tap from signing in twice.

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const USER_MESSAGE: Record<string, string> = {
  unreachable: "Couldn't reach OLT. Try again in a bit.",
  bad_password: "OLT didn't accept that password.",
  otp_required: "OLT asked for a one-time code, which IIMPresent can't enter for you.",
  session_lost: "Signed in to OLT, but it asked to sign in again on the Attendance page.",
  no_term: "OLT doesn't list that term.",
  no_table: "OLT's attendance page didn't have a table IIMPresent could read.",
};

/**
 * One sign-in and read, recorded either way. Returns the stored row, or an
 * error with the HTTP status that fits it.
 */
async function refreshFor(
  userId: string,
  email: string,
  password: string,
  term: string,
): Promise<{ row?: Record<string, unknown>; error?: string; code?: string; status: number }> {
  const loginId = email.slice(0, -DOMAIN.length);
  const attempted_at = new Date().toISOString();

  try {
    const got = await readAttendance(loginId, password, term);
    const row = {
      user_id: userId,
      term: got.term,
      terms: got.terms,
      columns: got.columns,
      rows: got.rows,
      datewise: got.datewise,
      fetched_at: attempted_at,
      attempted_at,
      last_error: null,
    };
    const { error } = await admin.from("olt_attendance").upsert(row);
    if (error) throw error;
    return { row, status: 200 };
  } catch (err) {
    const code = err instanceof OltError ? err.code : "internal";
    // The code and OLT's own wording, never the password or the page.
    console.error("olt read failed", { user: userId, code, message: String((err as Error).message) });

    // A term problem says which terms OLT does list, which is what the
    // student needs to pick again; the rest stay plain.
    const message = code === "no_term"
      ? (err as Error).message
      : USER_MESSAGE[code] ?? "Something went wrong reading OLT.";
    await admin.from("olt_attendance").upsert({ user_id: userId, attempted_at, last_error: message });

    return {
      error: message,
      code,
      status: code === "bad_password" ? 401 : code === "internal" ? 500 : 502,
    };
  }
}

async function isTester(userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("is_tester").eq("id", userId).maybeSingle();
  return Boolean(data?.is_tester);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({}));

    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: "Sign in again." }, 401);

    // Checked here as well as in the table's policy: the policy only guards
    // the reading, and this is the part that signs in to OLT.
    if (!(await isTester(user.id))) return json({ error: "Not available yet." }, 403);

    const email = String(user.email ?? "").toLowerCase();
    if (!email.endsWith(DOMAIN)) return json({ error: "Needs an institute account." }, 400);

    if (body?.action !== "refresh") return json({ error: "Unknown action." }, 400);

    // Always named by the student. With no term, OLT shows one of its own
    // choosing, and that is how Term-I once came back for a Term V question.
    const term = typeof body.term === "string" ? body.term.trim().slice(0, 40) : "";
    if (!term) return json({ error: "Choose a term.", code: "need_term" }, 400);

    const password = typeof body.password === "string" ? body.password : "";
    if (!password) return json({ error: "Enter your OLT password.", code: "need_password" }, 400);

    const result = await refreshFor(user.id, email, password, term);
    if (result.error) return json({ error: result.error, code: result.code }, result.status);
    return json({ ok: true, snapshot: result.row });
  } catch (err) {
    console.error(err);
    return json({ error: "Something broke." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
