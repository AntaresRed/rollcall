import { DAYS, weekdayOf, pretty } from "../lib/api";

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
