import { useEffect, useState } from "react";
import { loadOltAttendance, termNumber } from "../lib/api";
import OltCourses from "./OltCourses";
import { useOltRead } from "./OltSync";

const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : null;

// Asked as a number, not offered from OLT's own list: on a first visit that
// list isn't known yet. A term OLT doesn't have comes back as an error naming
// the ones it does.
const TERMS = [1, 2, 3, 4, 5, 6];

/**
 * The institute's own attendance record, read from OLT. Tester-only.
 *
 * The term comes first, and the attendance shown is only ever the term
 * picked. OLT opens on a term of its own choosing, so a read that didn't name
 * one once showed Term I to someone asking about Term V.
 *
 * The password works as on the breakdown's OLT Sync, through the same form:
 * asked for, with "Remember my password", until one is saved; after that,
 * just the button.
 *
 * Shown as OLT printed it — its column headings, its numbers — and never mixed
 * into the student's own marks. The two are different records, and this one
 * is only ever a copy as of the time printed above it.
 *
 * `initial` skips the first load; the smoke test uses it to render each state.
 */
export default function OltAttendance({ email, onBack, initial, onRead }) {
  const [snap, setSnap] = useState(initial ?? null);
  const [loading, setLoading] = useState(initial === undefined);
  const [loadError, setLoadError] = useState("");
  const [term, setTerm] = useState(String(termNumber(initial?.term) ?? ""));
  const read = useOltRead({
    email,
    saved: Boolean(snap?.password_saved),
    // Handed on to App as well, which keeps the breakdown's copy current and
    // fills unmarked classes when this read is for the current term.
    onSnap: (s, fresh) => { setSnap(s); return onRead?.(s, fresh); },
    showLogin: true,
  });

  useEffect(() => {
    if (initial !== undefined) return;
    loadOltAttendance()
      .then((s) => {
        setSnap(s);
        setTerm(String(termNumber(s?.term) ?? ""));
      })
      .catch((err) => setLoadError(err.message || "Couldn't load your OLT attendance."))
      .finally(() => setLoading(false));
  }, [initial]);

  const ready = Boolean(term) && read.ready;
  const error = read.error || loadError;

  // The stored copy is shown only when it is the term picked. Another term's
  // numbers under this term's name would be the worst thing this screen
  // could show.
  const matches = Boolean(term) && snap?.fetched_at && termNumber(snap.term) === Number(term);
  const staleError = !error && snap?.last_error
    && (!snap.fetched_at || snap.attempted_at > snap.fetched_at);

  return (
    <>
      <div className="eyebrow">Official attendance</div>
      <p className="screen-note">
        The institute&apos;s own record, read from OLT. It&apos;s separate from
        the classes you mark here, and only you can see it.
      </p>

      {loading && <div className="empty">Loading…</div>}

      {!loading && (
        <form
          className="leave-form olt-form"
          onSubmit={(e) => { e.preventDefault(); if (ready) read.submit(`Term ${term}`); }}
        >
          <label className="leave-field">
            <span>Term</span>
            <select value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="" disabled>Choose a term</option>
              {TERMS.map((n) => <option key={n} value={String(n)}>Term {n}</option>)}
            </select>
          </label>

          {read.fields}

          <button className="btn block" disabled={read.busy || !ready}>
            {read.busy
              ? "Reading OLT…"
              : !term ? "Choose a term first"
              : !read.ready ? "Enter your OLT password"
              : `Read Term ${term} from OLT`}
          </button>
        </form>
      )}

      {read.warning && <div className="olt-sync-warn">{read.warning}</div>}
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
