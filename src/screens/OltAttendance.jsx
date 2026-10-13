import { useEffect, useState } from "react";
import { loadOltAttendance, refreshOltAttendance, forgetOltPassword } from "../lib/api";

const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : null;

// OLT prints the percentage as a bare number ("87") under a heading that says
// it's a percentage. On its own as the big number, it needs the sign back.
// Anything else it prints is shown untouched.
const asPct = (v) => (/^\d+(\.\d+)?$/.test(String(v ?? "").trim()) ? `${String(v).trim()}%` : v);

/**
 * The institute's own attendance record, read from OLT. Tester-only.
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
  const [remember, setRemember] = useState(Boolean(initial?.password_saved));
  const [typing, setTyping] = useState(false); // replacing a saved password
  const [term, setTerm] = useState(initial?.term ?? "");

  useEffect(() => {
    if (initial !== undefined) return;
    loadOltAttendance()
      .then((s) => { setSnap(s); setTerm(s?.term ?? ""); setRemember(Boolean(s?.password_saved)); })
      .catch((err) => setError(err.message || "Couldn't load your OLT attendance."))
      .finally(() => setLoading(false));
  }, [initial]);

  const saved = Boolean(snap?.password_saved);
  const askPassword = !saved || typing;
  const loginId = String(email ?? "").split("@")[0];

  const refresh = async (e) => {
    e?.preventDefault();
    setBusy("refresh");
    setError("");
    try {
      const res = await refreshOltAttendance({
        password: askPassword ? password : undefined,
        remember: askPassword ? remember : true,
        term: term || undefined,
      });
      setSnap(res.snapshot);
      setTerm(res.snapshot?.term ?? "");
      setPassword("");
      setTyping(false);
    } catch (err) {
      setError(err.message);
      // A saved password OLT turned down has already been deleted on the
      // server; reload so the screen stops offering it.
      const s = await loadOltAttendance().catch(() => null);
      if (s) setSnap(s);
      if (err.code === "bad_password" || err.code === "need_password") setTyping(true);
    } finally {
      setBusy("");
    }
  };

  const forget = async () => {
    setBusy("forget");
    setError("");
    try {
      await forgetOltPassword();
      setSnap((s) => (s ? { ...s, password_saved: false } : s));
      setRemember(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const columns = snap?.columns ?? [];
  const rows = snap?.rows ?? [];
  // OLT's own headings decide the layout: the course column becomes the
  // card's title and a percentage column its big number. Neither is assumed
  // to exist.
  const titleCol = Math.max(0, columns.findIndex((c) => /course|subject/i.test(c)));
  const pctCol = columns.findIndex((c) => /%|percent/i.test(c));
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

      {!loading && snap?.fetched_at && (
        <div className="olt-head">
          <strong>{snap.term || "OLT"}</strong>
          <span>Read from OLT {fmtWhen(snap.fetched_at)}</span>
        </div>
      )}

      {(error || staleError) && (
        <div className="notice" style={{ marginBottom: 14 }}>
          {error || `Last try (${fmtWhen(snap.attempted_at)}): ${snap.last_error}`}
        </div>
      )}

      {!loading && rows.length === 0 && !snap?.fetched_at && (
        <div className="empty">Nothing read from OLT yet.</div>
      )}

      {rows.map((cells, i) => (
        <div className="olt-row" key={i}>
          <div className="olt-row-head">
            <span className="course">{cells[titleCol] || "—"}</span>
            {pctCol >= 0 && pctCol !== titleCol && <span className="olt-pct">{asPct(cells[pctCol])}</span>}
          </div>
          <dl className="olt-cells">
            {columns.map((c, j) => (j === titleCol || j === pctCol ? null : (
              <div key={j}>
                <dt>{c}</dt>
                <dd>{cells[j] || "—"}</dd>
              </div>
            )))}
          </dl>
        </div>
      ))}

      {!loading && (
        <form className="leave-form olt-form" onSubmit={refresh}>
          {snap?.terms?.length > 1 && (
            <label className="leave-field">
              <span>Term</span>
              <select value={term} onChange={(e) => setTerm(e.target.value)}>
                {snap.terms.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          )}

          {askPassword ? (
            <>
              <label className="leave-field">
                <span>OLT password for {loginId || "your account"}</span>
                <input
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="olt-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>
                  <strong>Save my password</strong> so I don&apos;t have to type it again.
                  It&apos;s stored encrypted and used only to read this page. Leave this
                  unticked and it&apos;s used once, then thrown away.
                </span>
              </label>
              <button className="btn block" disabled={busy === "refresh" || !password}>
                {busy === "refresh" ? "Reading OLT…" : "Read from OLT"}
              </button>
              {saved && (
                <button type="button" className="btn ghost block" onClick={() => setTyping(false)}>
                  Use my saved password
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn block" disabled={busy === "refresh"}>
                {busy === "refresh" ? "Reading OLT…" : "Refresh from OLT"}
              </button>
              <p className="olt-saved">
                Your OLT password is saved.{" "}
                <button type="button" className="olt-link" onClick={() => setTyping(true)}>
                  Type a new one
                </button>{" · "}
                <button
                  type="button"
                  className="olt-link"
                  disabled={busy === "forget"}
                  onClick={forget}
                >
                  {busy === "forget" ? "Forgetting…" : "Forget it"}
                </button>
              </p>
            </>
          )}
        </form>
      )}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to profile
        </button>
      )}
    </>
  );
}
