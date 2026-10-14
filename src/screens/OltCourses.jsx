import { useEffect, useState } from "react";
import { DAYS, weekdayOf, pretty, loadOltAttendance, termNumber } from "../lib/api";

const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : null;

// OLT prints the percentage as a bare number ("87") under a heading that says
// it's a percentage. On its own as the big number, it needs the sign back.
// Anything else it prints is shown untouched.
export const asPct = (v) =>
  (/^\d+(\.\d+)?$/.test(String(v ?? "").trim()) ? `${String(v).trim()}%` : v);

const MARK = { P: ["present", "Present"], A: ["absent", "Absent"] };

/**
 * OLT's courses for one term, each opening onto OLT's own session dates.
 *
 * Drawn with the Attendance breakdown's cards on purpose, so the official
 * record and the student's own marks read the same way and can be compared
 * line for line. Only the presentation is shared: these numbers are OLT's,
 * shown as printed, and nothing here mixes them with the app's.
 *
 * Laid out from OLT's own headings — the course column is the title, a
 * percentage column the big number — and any column it doesn't recognise
 * is still shown, under OLT's name for it.
 */
export default function OltCourses({ snap }) {
  const columns = snap?.columns ?? [];
  const rows = snap?.rows ?? [];
  const col = (re) => columns.findIndex((c) => re.test(c));
  const titleCol = Math.max(0, col(/course|subject/i));
  const pctCol = col(/%|percent/i);
  const attendedCol = col(/^attended$/i);
  const totalCol = col(/total/i);
  const known = new Set([titleCol, pctCol, attendedCol, totalCol]);

  return rows.map((cells, i) => {
    const name = cells[titleCol] || "—";
    const pct = pctCol >= 0 && pctCol !== titleCol ? cells[pctCol] : null;
    const low = /^\d+(\.\d+)?$/.test(String(pct ?? "").trim()) && Number(pct) < 75;
    const dw = snap?.datewise?.[cells[titleCol]];
    const sessions = dw?.sessions ?? [];
    const present = sessions.filter((s) => s.mark === "P").length;
    const absent = sessions.filter((s) => s.mark === "A").length;

    const summary = (
      <>
        <div className="ab-head">
          <div className="ab-name">{name}</div>
          {pct != null && <div className={`ab-pct${low ? " low" : ""}`}>{asPct(pct)}</div>}
        </div>
        {attendedCol >= 0 && totalCol >= 0 ? (
          <div className="ab-sub">
            {cells[attendedCol] || "—"} of {cells[totalCol] || "—"} attended
          </div>
        ) : (
          <dl className="olt-cells">
            {columns.map((c, j) => (known.has(j) ? null : (
              <div key={j}>
                <dt>{c}</dt>
                <dd>{cells[j] || "—"}</dd>
              </div>
            )))}
          </dl>
        )}
        {sessions.length > 0 && (
          <div className="ab-legend">
            <span className="ab-key present"><i />Present <b>{present}</b></span>
            <span className="ab-key absent"><i />Absent <b>{absent}</b></span>
          </div>
        )}
        {dw?.error && <div className="olt-dw-note">Dates: {dw.error}</div>}
        {sessions.length > 0 && dw.agrees === false && (
          <div className="olt-dw-note warn">
            OLT&apos;s dates don&apos;t add up to its own totals for this course.
          </div>
        )}
      </>
    );

    if (!sessions.length) return <div className="ab-card olt-card" key={i}>{summary}</div>;

    return (
      <details className="ab-card" key={i}>
        <summary className="ab-summary">
          {summary}
          <span className="ab-more">
            <ChevronIcon />
            Date-wise Breakdown
          </span>
        </summary>
        <div className="ab-sessions">
          {sessions.map((s) => {
            const day = new Date(`${s.date}T00:00:00`);
            const [cls, label] = MARK[s.mark] ?? ["unmarked", s.mark || "—"];
            return (
              <div className="ab-session" key={`${s.no}|${s.date}|${s.time}`}>
                <span className="ab-when">
                  <b>{DAYS[weekdayOf(day) - 1]}</b>{" "}
                  {day.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
                <span className="ab-at">{pretty(s.time).replace(" ", "")}</span>
                <span className={`ab-status ${cls}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </details>
    );
  });
}

/**
 * The OLT section at the foot of Attendance breakdown. Tester-only; it loads
 * its own copy so the breakdown doesn't wait on it.
 *
 * Shown only when the copy is for the term on screen. The breakdown is about
 * this term, and another term's official numbers under it would invite a
 * comparison that means nothing.
 *
 * `initial` skips the load; the smoke test uses it to render each state.
 */
export function OltBreakdownSection({ termLabel, initial }) {
  const [snap, setSnap] = useState(initial ?? null);
  const [loading, setLoading] = useState(initial === undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial !== undefined) return;
    loadOltAttendance()
      .then(setSnap)
      .catch((err) => setError(err.message || "Couldn't load OLT's copy."))
      .finally(() => setLoading(false));
  }, [initial]);

  const want = termNumber(termLabel);
  const have = termNumber(snap?.term);
  const otherTerm = Boolean(snap?.fetched_at) && want !== null && have !== want;
  const where = "Profile → Official attendance (OLT)";

  return (
    <section className="olt-ab">
      <div className="eyebrow">Official (OLT)</div>
      <div className="dev-flag dev-flag-banner">DO NOT TOUCH, UNDER DEVELOPMENT</div>

      {loading && <div className="empty">Loading…</div>}
      {error && <div className="notice">{error}</div>}

      {!loading && !error && !snap?.fetched_at && (
        <div className="empty">Nothing read from OLT yet. Read it from {where}.</div>
      )}

      {!loading && otherTerm && (
        <div className="empty">
          OLT was last read for {snap.term}. Read {termLabel} from {where} to compare.
        </div>
      )}

      {!loading && snap?.fetched_at && !otherTerm && (
        <>
          <div className="olt-head">
            <strong>{snap.term}</strong>
            <span>Read from OLT {fmtWhen(snap.fetched_at)}</span>
          </div>
          <OltCourses snap={snap} />
        </>
      )}
    </section>
  );
}

function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M4.5 7 9 11.5 13.5 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
