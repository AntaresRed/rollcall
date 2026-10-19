import { useState } from "react";
import { loadOltAttendance, refreshOltAttendance, termNumber } from "../lib/api";

// The day matters as much as the time: "4:12 pm" alone doesn't say whether
// the copy is from this morning or last week.
const fmtSynced = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });

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

/**
 * Hands a password OLT has just accepted to the browser's own password
 * manager, which asks the student whether to save it. Chrome supports this;
 * Safari doesn't have the call, and decides for itself from the form's
 * username and current-password fields. Either way the password lives in the
 * phone's keychain, behind its lock — never in IIMPresent's storage or on the
 * server — and nothing breaks if the browser says no.
 */
export async function offerToSave(id, password) {
  try {
    if (!window.PasswordCredential || !navigator.credentials?.store) return;
    await navigator.credentials.store(new window.PasswordCredential({ id, password, name: `OLT — ${id}` }));
  } catch { /* declined, or not allowed here */ }
}

/**
 * "OLT Sync" on the Attendance breakdown: when OLT was last read, and the
 * password box that reads it again. Tester-only.
 *
 * Always reads the term on screen, so there is no term to pick: the
 * breakdown is about this term, and a sync that fetched another would leave
 * the OLT column blank with no obvious reason why.
 *
 * The password is used for one read and kept nowhere by the app, exactly as
 * on Profile's OLT screen — both forms carry the same login ID under the same
 * site, so whatever the phone saved from one fills the other.
 *
 * The copy itself belongs to the breakdown, which lays it beside the
 * student's marks; this only reports and replaces it.
 */
export default function OltSync({ termLabel, email, snap, loading, loadError, onSynced }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const n = termNumber(termLabel);
  const loginId = String(email ?? "").split("@")[0];
  const thisTerm = Boolean(snap?.fetched_at) && n !== null && termNumber(snap.term) === n;
  const staleError = snap?.last_error
    && (!snap.fetched_at || snap.attempted_at > snap.fetched_at);

  const sync = async (e) => {
    e.preventDefault();
    if (!password || n === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await refreshOltAttendance({ term: `Term ${n}`, password });
      onSynced(res.snapshot);
      // Only once OLT has accepted it, so a typo is never offered for saving.
      if (loginId) offerToSave(loginId, password);
      setPassword("");
      setShowPassword(false);
    } catch (err) {
      setError(err.message);
      // The function records the failed try; pick that up so the line above
      // the box says when it happened.
      const s = await loadOltAttendance().catch(() => null);
      if (s) onSynced(s);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="olt-sync">
      <div className="olt-sync-head">OLT Sync</div>
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
      ) : (
        <form className="olt-sync-form" onSubmit={sync}>
          {/* The username half of the pair, out of sight: the login ID is
              always the signed-in student's own, but the phone needs it to
              file the password as "OLT — anuja2027" rather than as a
              nameless password for this site. */}
          <input
            className="sr-only"
            type="text"
            name="username"
            value={loginId}
            autoComplete="username"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
          />
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
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
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
          <button className="btn block" disabled={busy || !password}>
            {busy ? "Syncing…" : "Sync now"}
          </button>
          <p className="olt-pass-note">
            IIMPresent doesn&apos;t keep your password. Your phone can save it for
            you and fill it in next time.
          </p>
        </form>
      )}

      {(error || loadError || staleError) && (
        <div className="notice" style={{ marginTop: 12 }}>
          {error || loadError || `Last try (${fmtSynced(snap.attempted_at)}): ${snap.last_error}`}
        </div>
      )}
    </section>
  );
}
