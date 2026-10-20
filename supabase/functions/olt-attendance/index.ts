// ============================================================
// POST /functions/v1/olt-attendance
//
// Reads a student's official attendance from OLT and keeps the latest copy in
// public.olt_attendance. Tester-only (profiles.is_tester).
//
// From the app, with the student's own session:
//   { action: "refresh", term, password?, remember? }
//   { action: "save", password }     — Profile: check with OLT, then keep
//   { action: "forget" }             — Profile: delete the kept password
//
// The OLT login ID is always the signed-in student's own address, never
// something the request names, so the function can only ever read the account
// of the person asking.
//
// A password is used for one sign-in and dropped, unless the student ticks
// "Remember my password". Then it is sealed here with OLT_PASSWORD_KEY before
// it goes anywhere near the database, and nothing ever sends it back out —
// no action returns it, in any form. It is deleted the first time OLT turns
// it down: retrying a password OLT has rejected is how an account gets locked.
//
//   supabase secrets set OLT_PASSWORD_KEY=$(openssl rand -base64 32) --project-ref <ref>
//   supabase functions deploy olt-attendance --project-ref <ref>
// ============================================================

// Same pin as the other functions; see mark-attendance for why it's exact.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { checkPassword, OltError, readAttendance } from "./olt.ts";

const SEAL_KEY = Deno.env.get("OLT_PASSWORD_KEY") ?? "";
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

const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Thrown when saving is asked for and the server has no key to seal with —
 *  said plainly, rather than as a failed read. */
class NoSealKey extends Error {}

async function sealKey(): Promise<CryptoKey> {
  let raw: Uint8Array;
  try { raw = unb64(SEAL_KEY); } catch { raw = new Uint8Array(); }
  if (raw.length !== 32) throw new NoSealKey("OLT_PASSWORD_KEY must be 32 bytes, base64.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// AES-256-GCM with a fresh IV each time. The user id goes in as additional
// data: the ciphertext then only opens on the row it was written for, so
// copying it onto another student's row gets nothing.
async function seal(userId: string, password: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(userId) },
    await sealKey(),
    encoder.encode(password),
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

async function unseal(userId: string, sealed: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unrecognised sealed password.");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv), additionalData: encoder.encode(userId) },
    await sealKey(),
    unb64(ct),
  );
  return new TextDecoder().decode(pt);
}

/** The flag the app reads to decide whether to show the password box. Kept on
 *  olt_attendance, which the student can already read, so the credentials
 *  table never needs a policy that lets anyone near it. */
const markSaved = (userId: string, saved: boolean) =>
  admin.from("olt_attendance").upsert({ user_id: userId, password_saved: saved });

async function keepPassword(userId: string, password: string) {
  const { error } = await admin.from("olt_credentials").upsert({
    user_id: userId, sealed: await seal(userId, password), saved_at: new Date().toISOString(),
  });
  if (error) throw error;
  await markSaved(userId, true);
}

async function forgetPassword(userId: string) {
  await admin.from("olt_credentials").delete().eq("user_id", userId);
  await markSaved(userId, false);
}

async function savedPassword(userId: string): Promise<string | null> {
  const { data } = await admin.from("olt_credentials")
    .select("sealed").eq("user_id", userId).maybeSingle();
  if (!data?.sealed) return null;
  try {
    return await unseal(userId, data.sealed);
  } catch (err) {
    if (err instanceof NoSealKey) throw err;
    // A rotated key, or a damaged row. Either way it can never be used again,
    // and keeping it would only make the screen claim a password is saved.
    console.error("unseal failed", { user: userId, err: String(err) });
    await forgetPassword(userId);
    return null;
  }
}

const USER_MESSAGE: Record<string, string> = {
  unreachable: "Couldn't reach OLT. Try again in a bit.",
  bad_password: "OLT didn't accept that password.",
  otp_required: "OLT asked for a one-time code, which IIMPresent can't enter for you.",
  session_lost: "Signed in to OLT, but it asked to sign in again on the Attendance page.",
  no_term: "OLT doesn't list that term.",
  no_table: "OLT's attendance page didn't have a table IIMPresent could read.",
};

const NO_KEY_MESSAGE = "Saving passwords isn't set up on IIMPresent's server yet.";

const statusFor = (code: string) =>
  code === "bad_password" ? 401 : code === "internal" ? 500 : 502;

/**
 * One sign-in and read, recorded either way. Returns the stored row, or an
 * error with the HTTP status that fits it.
 */
async function refreshFor(
  userId: string,
  email: string,
  password: string,
  usedSaved: boolean,
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
    let code = err instanceof OltError ? err.code : "internal";
    // The code and OLT's own wording, never the password or the page.
    console.error("olt read failed", { user: userId, code, message: String((err as Error).message) });

    // A term problem says which terms OLT does list, which is what the
    // student needs to pick again; the rest stay plain.
    let message = code === "no_term"
      ? (err as Error).message
      : USER_MESSAGE[code] ?? "Something went wrong reading OLT.";

    // The saved one has stopped working — changed on OLT, most likely. It
    // goes now, so the next tap asks for the new one instead of knocking on
    // OLT with a password it has already refused.
    if (code === "bad_password" && usedSaved) {
      await forgetPassword(userId);
      code = "saved_rejected";
      message = "OLT turned down your saved password, so IIMPresent deleted it. Enter your current one.";
    }

    await admin.from("olt_attendance").upsert({ user_id: userId, attempted_at, last_error: message });

    return { error: message, code, status: statusFor(code === "saved_rejected" ? "bad_password" : code) };
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
    const action = String(body?.action ?? "");

    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: "Sign in again." }, 401);

    // Checked here as well as in the table's policy: the policy only guards
    // the reading, and this is the part that signs in to OLT.
    if (!(await isTester(user.id))) return json({ error: "Not available yet." }, 403);

    const email = String(user.email ?? "").toLowerCase();
    if (!email.endsWith(DOMAIN)) return json({ error: "Needs an institute account." }, 400);

    const typed = typeof body.password === "string" && body.password.length > 0
      ? body.password as string
      : null;

    try {
      if (action === "forget") {
        await forgetPassword(user.id);
        return json({ ok: true, password_saved: false });
      }

      if (action === "save") {
        if (!typed) return json({ error: "Enter your OLT password.", code: "need_password" }, 400);
        // Checked with OLT first, so a typo is never what gets kept.
        try {
          await checkPassword(email.slice(0, -DOMAIN.length), typed);
        } catch (err) {
          const code = err instanceof OltError ? err.code : "internal";
          console.error("olt check failed", { user: user.id, code });
          return json({ error: USER_MESSAGE[code] ?? "Something went wrong reaching OLT.", code },
            statusFor(code));
        }
        await keepPassword(user.id, typed);
        return json({ ok: true, password_saved: true });
      }

      if (action !== "refresh") return json({ error: "Unknown action." }, 400);

      // Always named by the student. With no term, OLT shows one of its own
      // choosing, and that is how Term-I once came back for a Term V question.
      const term = typeof body.term === "string" ? body.term.trim().slice(0, 40) : "";
      if (!term) return json({ error: "Choose a term.", code: "need_term" }, 400);

      const password = typed ?? await savedPassword(user.id);
      if (!password) return json({ error: "Enter your OLT password.", code: "need_password" }, 400);

      const result = await refreshFor(user.id, email, password, !typed, term);

      // A typed password is only kept after OLT has accepted it, so a typo is
      // never saved. Typing one with the box unticked is a withdrawal of
      // consent, and removes any copy saved earlier.
      let password_saved = !typed;
      let warning: string | null = null;
      if (typed && result.row) {
        if (body.remember === true) {
          // The read worked and is already stored; failing to keep the
          // password mustn't turn that into an error screen.
          try {
            await keepPassword(user.id, typed);
            password_saved = true;
          } catch (err) {
            console.error("save failed", { user: user.id, err: String(err) });
            password_saved = false;
            warning = err instanceof NoSealKey
              ? NO_KEY_MESSAGE
              : "Synced, but IIMPresent couldn't save your password. Try ticking it again next time.";
          }
        } else {
          await forgetPassword(user.id);
          password_saved = false;
        }
      }

      if (result.error) return json({ error: result.error, code: result.code }, result.status);
      return json({ ok: true, snapshot: { ...result.row, password_saved }, warning });
    } catch (err) {
      if (!(err instanceof NoSealKey)) throw err;
      console.error("OLT_PASSWORD_KEY is not set");
      return json({ error: NO_KEY_MESSAGE, code: "no_key" }, 500);
    }
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
