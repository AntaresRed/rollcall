import { useEffect, useState } from "react";
import {
  loadOltAttendance, refreshOltAttendance, saveOltPassword, forgetOltPassword, termNumber,
} from "../lib/api";

// The day matters as much as the time: "4:12 pm" alone doesn't say whether
// the copy is from this morning or last week.
const fmtSynced = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });

const loginIdOf = (email) => String(email ?? "").split("@")[0];

/** An eye, struck through when the password is showing — the icon names what
 *  the next tap does. Same stroke style as the tab icons. */
export function EyeIcon({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
      {off && <path d="M4 20 20 4" />}
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M17.7 2.8v3.8h-3.8M6.3 21.2v-3.8h3.8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * Hands a password OLT has just accepted to the browser's own password
 * manager, which asks the student whether to save it. Chrome supports this;
 * Safari doesn't have the call, and decides for itself from the form's
 * username and current-password fields. Nothing breaks if the browser says no.
 */
export async function offerToSave(id, password) {
  try {
    if (!window.PasswordCredential || !navigator.credentials?.store) return;
    await navigator.credentials.store(new window.PasswordCredential({ id, password, name: `OLT — ${id}` }));
  } catch { /* declined, or not allowed here */ }
}

/**
 * The OLT password box, with its eye. The username half of the pair rides
 * along out of sight unless `showLogin`: the login ID is always the
 * signed-in student's own, but the phone needs it to file the password as
 * "OLT — anuja2027" rather than as a nameless password for this site.
 */
export function OltPasswordField({ loginId, value, onChange, label = "OLT password", showLogin = false }) {
  const [show, setShow] = useState(false);
  // Hidden again whenever the box is cleared, so it never reopens showing.
  useEffect(() => { if (!value) setShow(false); }, [value]);

  return (
    <>
      {showLogin ? (
        <label className="leave-field olt-login">
          <span>OLT login ID</span>
          <input type="text" name="username" value={loginId} autoComplete="username" readOnly />
        </label>
      ) : (
        <input className="sr-only" type="text" name="username" value={loginId}
          autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" />
      )}
      <label className="leave-field">
        <span>{label}</span>
        <div className="olt-pass">
          <input
            type={show ? "text" : "password"}
            name="password"
            value={value}
            autoComplete="current-password"
            // Shown as typed, a password must not be "corrected" or
            // capitalised by the phone's keyboard.
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="olt-eye"
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            onClick={() => setShow((v) => !v)}
          >
            <EyeIcon off={show} />
          </button>
        </div>
      </label>
    </>
  );
}

/**
 * How a remembered password is kept, in words a student can check against
 * what the code does. Every sentence is a promise the server keeps: it is
 * sealed in the Edge Function before it reaches the database, the key is a
 * function secret the database never sees, the credentials table has no
 * policy and no grants, and no action ever returns the password.
 *
 * It deliberately stops short of "nobody could ever decrypt it": the server
 * has to unlock it to sign in to OLT, so whoever controls the server's code
 * could. What it says instead — no screen, table or export shows it — is true.
 */
export function RememberNote() {
  return (
    <ul className="olt-remember-how">
      <li>
        Encrypted with AES-256 before it&apos;s stored. The key lives apart from
        the database, so the database only ever holds scrambled text, which no one, including IIMPresent owner can't read.
      </li>
      <li>
        No screen, table or export shows it, to you, to anyone running
        IIMPresent, or to anyone else. Nothing ever sends it back to the app.
      </li>
      <li>
        Unlocked only for the moment a sync signs in to OLT. If OLT turns it
        down, it&apos;s deleted straight away.
      </li>
      <li>Change or delete it any time from Profile.</li>
    </ul>
  );
}

function RememberBox({ checked, onChange }) {
  return (
    <div className={`olt-remember${checked ? " on" : ""}`}>
      <label className="olt-remember-tick">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>Remember my password</span>
      </label>
      <RememberNote />
    </div>
  );
}

/**
 * The term-agnostic half of a read, shared by OLT Sync and Profile's OLT
 * screen: the password box and "Remember my password" when nothing is saved,
 * and nothing at all when something is — a saved password means one tap.
 *
 * Returns the form's fields and a `submit(term)` that reads OLT and reports
 * back through `onSnap`.
 */
export function useOltRead({ email, saved, onSnap, showLogin = false }) {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const loginId = loginIdOf(email);

  const submit = async (term) => {
    if (!saved && !password) return;
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const res = await refreshOltAttendance({
        term, password: saved ? undefined : password, remember: !saved && remember,
      });
      onSnap(res.snapshot);
      if (res.warning) setWarning(res.warning);
      // Only once OLT has accepted it, so a typo is never offered for saving.
      // Not when IIMPresent is keeping it: the phone would then hold a second
      // copy the student didn't ask for.
      if (!saved && !remember && loginId) offerToSave(loginId, password);
      setPassword("");
      setRemember(false);
    } catch (err) {
      setError(err.message);
      // The function records the failed try — and, if OLT refused a saved
      // password, deletes it — so pick that up: the box comes back.
      const s = await loadOltAttendance().catch(() => null);
      if (s) onSnap(s);
    } finally {
      setBusy(false);
    }
  };

  const fields = saved ? (
    <div className="olt-saved">
      <LockIcon />
      <span>Password saved, encrypted. Change or delete it in Profile.</span>
    </div>
  ) : (
    <>
      <OltPasswordField loginId={loginId} value={password} showLogin={showLogin}
        onChange={(v) => { setPassword(v); setError(""); }} />
      <RememberBox checked={remember} onChange={setRemember} />
    </>
  );

  return { fields, submit, busy, error, warning, ready: saved || Boolean(password) };
}

/**
 * "OLT Sync" on the Attendance breakdown: when OLT was last read, and the
 * one button that reads it again. Tester-only.
 *
 * Always reads the term on screen, so there is no term to pick: the
 * breakdown is about this term, and a sync that fetched another would leave
 * the OLT column blank with no obvious reason why.
 *
 * Set apart from the page in the app's accent colour: everything else here
 * is the student's own record, and this is the one place that reaches out to
 * another system.
 *
 * The copy itself belongs to the breakdown, which lays it beside the
 * student's marks; this only reports and replaces it.
 */
export default function OltSync({ termLabel, email, snap, loading, loadError, onSynced }) {
  const n = termNumber(termLabel);
  const saved = Boolean(snap?.password_saved);
  const read = useOltRead({ email, saved, onSnap: onSynced });

  const thisTerm = Boolean(snap?.fetched_at) && n !== null && termNumber(snap.term) === n;
  const staleError = !read.error && snap?.last_error
    && (!snap.fetched_at || snap.attempted_at > snap.fetched_at);

  return (
    <section className="olt-sync">
      <div className="olt-sync-head">
        <span className="olt-sync-mark"><SyncIcon /></span>
        <span>OLT Sync</span>
      </div>
      <div className="dev-flag dev-flag-banner">DO NOT TOUCH, UNDER DEVELOPMENT</div>

      <div className="olt-sync-when">
        {loading ? "Loading…"
          : thisTerm ? <>Last synced <b>{fmtSynced(snap.fetched_at)}</b></>
          : snap?.fetched_at ? <>Last synced for {snap.term}, {fmtSynced(snap.fetched_at)}. Sync to read {termLabel}.</>
          : "Not synced yet"}
      </div>

      {n === null ? (
        <div className="olt-sync-note">
          No term calendar is published, so there&apos;s no term to read from OLT.
        </div>
      ) : !loading && (
        <form className="olt-sync-form" onSubmit={(e) => { e.preventDefault(); read.submit(`Term ${n}`); }}>
          {read.fields}
          <button className="btn block olt-sync-go" disabled={read.busy || !read.ready}>
            {read.busy ? "Syncing…" : "Sync now"}
          </button>
        </form>
      )}

      {read.warning && <div className="olt-sync-warn">{read.warning}</div>}
      {(read.error || loadError || staleError) && (
        <div className="notice" style={{ marginTop: 12 }}>
          {read.error || loadError || `Last try (${fmtSynced(snap.attempted_at)}): ${snap.last_error}`}
        </div>
      )}
    </section>
  );
}

/**
 * Profile's "OLT password": whether one is remembered, and the two things a
 * student can do about it — replace it, or delete it. Tester-only.
 *
 * A new password is checked with OLT before it replaces the old one, so a
 * typo never overwrites one that works. Deleting asks once more, in place,
 * because the next sync will then need the password typed again.
 *
 * `initial` skips the load; the smoke test uses it to render each state.
 */
export function OltPasswordSettings({ email, initial }) {
  // null while loading; a copy handed in (even an empty one) is already known.
  const [saved, setSaved] = useState(initial === undefined ? null : Boolean(initial?.password_saved));
  const [mode, setMode] = useState("");          // "" | "edit" | "delete"
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (initial !== undefined) return;
    loadOltAttendance()
      .then((s) => setSaved(Boolean(s?.password_saved)))
      .catch(() => setSaved(false));
  }, [initial]);

  const run = async (fn, message) => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fn();
      setSaved(Boolean(res.password_saved));
      setMode("");
      setPassword("");
      setDone(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = (e) => {
    e.preventDefault();
    if (password) run(() => saveOltPassword(password), "Saved. OLT accepted it.");
  };

  return (
    <section className="olt-pw">
      <div className="olt-pw-head">
        <span>OLT password</span>
        <span className="dev-flag">UNDER DEVELOPMENT</span>
      </div>
      <div className="olt-pw-state">
        {saved === null ? "Loading…"
          : saved ? <><LockIcon /> Saved, encrypted</>
          : "Not saved. Tick “Remember my password” when you sync, or save one here."}
      </div>

      {mode === "edit" && (
        <form className="olt-sync-form" onSubmit={save}>
          <OltPasswordField loginId={loginIdOf(email)} value={password}
            label={saved ? "New OLT password" : "OLT password"}
            onChange={(v) => { setPassword(v); setError(""); }} />
          <RememberNote />
          <div className="olt-pw-acts">
            <button className="btn olt-sync-go" disabled={busy || !password}>
              {busy ? "Checking with OLT…" : "Save password"}
            </button>
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => { setMode(""); setPassword(""); setError(""); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "delete" && (
        <div className="olt-pw-confirm">
          <p>Delete the saved password? The next sync will ask for it again.</p>
          <div className="olt-pw-acts">
            <button className="btn olt-pw-delete" disabled={busy}
              onClick={() => run(forgetOltPassword, "Deleted.")}>
              {busy ? "Deleting…" : "Delete it"}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setMode("")}>Keep it</button>
          </div>
        </div>
      )}

      {!mode && saved !== null && (
        <div className="olt-pw-acts">
          <button className="btn ghost" onClick={() => { setMode("edit"); setDone(""); }}>
            {saved ? "Change" : "Save a password"}
          </button>
          {saved && (
            <button className="btn ghost olt-pw-del-start" onClick={() => { setMode("delete"); setDone(""); }}>
              Delete
            </button>
          )}
        </div>
      )}

      {done && <div className="olt-pw-done">{done}</div>}
      {error && <div className="notice" style={{ marginTop: 10 }}>{error}</div>}
    </section>
  );
}
