import { useEffect, useState } from "react";
import { loadOltAttendance, refreshOltAttendance, termNumber } from "../lib/api";
import OltCourses from "./OltCourses";

const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : null;

// Asked as a number, not offered from OLT's own list: on a first visit that
// list isn't known yet. A term OLT doesn't have comes back as an error naming
// the ones it does.
const TERMS = [1, 2, 3, 4, 5, 6];

/** An eye, struck through when the password is showing — the icon names what
 *  the next tap does. Same stroke style as the tab icons. */
function EyeIcon({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
      {off && <path d="M4 20 20 4" />}
    </svg>
  );
}

/**
 * Hands a password OLT has just accepted to the browser's own password
 * manager, which asks the student whether to save it. Chrome supports this;
 * Safari doesn't have the call, and decides for itself from the form's
 * username and current-password fields. Either way the password lives in the
 * phone's keychain, behind its lock — never in IIMPresent's storage or on the
 * server — and nothing breaks if the browser says no.
 */
async function offerToSave(id, password) {
  try {
    if (!window.PasswordCredential || !navigator.credentials?.store) return;
    await navigator.credentials.store(new window.PasswordCredential({ id, password, name: `OLT — ${id}` }));
  } catch { /* declined, or not allowed here */ }
}

/**
 * The institute's own attendance record, read from OLT. Tester-only.
 *
 * The term and password come first, and the attendance shown is only ever
 * the term picked. OLT opens on a term of its own choosing, so a read that
 * didn't name one once showed Term I to someone asking about Term V.
 *
 * The password is asked for every time and kept nowhere by the app. The
 * fields are marked up so the phone's password manager can fill it in.
 *
 * Shown as OLT printed it — its column headings, its numbers — and never mixed
 * into the student's own marks. The two are different records, and this one
 * is only ever a copy as of the time printed above it.
 *
 * `initial` skips the first load; the smoke test uses it to render each state.
 */
export default function OltAttendance({ email, onBack, initial }) {
  const [snap, setSnap] = useState(initial ?? null);
  const [loading, setLoading] = useState(initial === undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [term, setTerm] = useState(String(termNumber(initial?.term) ?? ""));

  useEffect(() => {
    if (initial !== undefined) return;
    loadOltAttendance()
      .then((s) => {
        setSnap(s);
        setTerm(String(termNumber(s?.term) ?? ""));
      })
      .catch((err) => setError(err.message || "Couldn't load your OLT attendance."))
      .finally(() => setLoading(false));
  }, [initial]);

  const loginId = String(email ?? "").split("@")[0];
  const ready = Boolean(term) && Boolean(password);

  const refresh = async (e) => {
    e?.preventDefault();
    if (!ready) return;
    setBusy("refresh");
    setError("");
    try {
      const res = await refreshOltAttendance({ term: `Term ${term}`, password });
      setSnap(res.snapshot);
      // Only once OLT has accepted it, so a typo is never offered for saving.
      if (loginId) offerToSave(loginId, password);
      setPassword("");
      // Hidden again for next time, so it never opens already showing.
      setShowPassword(false);
    } catch (err) {
      setError(err.message);
      const s = await loadOltAttendance().catch(() => null);
      if (s) setSnap(s);
    } finally {
      setBusy("");
    }
  };

  // The stored copy is shown only when it is the term picked. Another term's
  // numbers under this term's name would be the worst thing this screen
  // could show.
  const matches = Boolean(term) && snap?.fetched_at && termNumber(snap.term) === Number(term);
  const staleError = snap?.last_error
    && (!snap.fetched_at || snap.attempted_at > snap.fetched_at);

  return (
    <>
      <div className="eyebrow">Official attendance</div>
      <div className="dev-flag dev-flag-banner">DO NOT TOUCH, UNDER DEVELOPMENT</div>
      <p className="screen-note">
        The institute&apos;s own record, read from OLT. It&apos;s separate from
        the classes you mark here, and only you can see it.
      </p>

      {loading && <div className="empty">Loading…</div>}

      {!loading && (
        <form className="leave-form olt-form" onSubmit={refresh}>
          <label className="leave-field">
            <span>Term</span>
            <select value={term} onChange={(e) => { setTerm(e.target.value); setError(""); }}>
              <option value="" disabled>Choose a term</option>
              {TERMS.map((n) => <option key={n} value={String(n)}>Term {n}</option>)}
            </select>
          </label>

          {/* The username half of the pair. Read-only, since the login ID is
              always the signed-in student's own, but present and marked so
              the phone files the password under it ("OLT — anuja2027")
              rather than as a nameless password for this site. */}
          <label className="leave-field olt-login">
            <span>OLT login ID</span>
            <input
              type="text"
              name="username"
              value={loginId}
              autoComplete="username"
              readOnly
            />
          </label>

          <label className="leave-field">
            <span>OLT password</span>
            <div className="olt-pass">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                autoComplete="current-password"
                // Shown as typed, a password must not be "corrected" or
                // capitalised by the phone's keyboard.
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="olt-eye"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </label>
          <p className="olt-pass-note">
            IIMPresent doesn&apos;t keep your password. Your phone can save it for
            you and fill it in next time.
          </p>
          <button className="btn block" disabled={busy === "refresh" || !ready}>
            {busy === "refresh"
              ? "Reading OLT…"
              : !term ? "Choose a term first"
              : !password ? "Enter your OLT password"
              : `Read Term ${term} from OLT`}
          </button>
        </form>
      )}

      {(error || staleError) && (
        <div className="notice" style={{ marginTop: 14 }}>
          {error || `Last try (${fmtWhen(snap.attempted_at)}): ${snap.last_error}`}
        </div>
      )}

      {matches && (
        <div className="olt-head olt-results">
          <strong>{snap.term}</strong>
          <span>Read from OLT {fmtWhen(snap.fetched_at)}</span>
        </div>
      )}

      {!loading && term && !matches && (
        <div className="empty" style={{ marginTop: 14 }}>
          Term {term} hasn&apos;t been read from OLT yet.
        </div>
      )}

      {matches && !snap.rows?.length && (
        <div className="empty">OLT lists no courses for {snap.term}.</div>
      )}

      {matches && <OltCourses snap={snap} />}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to profile
        </button>
      )}
    </>
  );
}
