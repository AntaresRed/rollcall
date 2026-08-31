import { useMemo } from "react";
import { attendanceBreakdown, pretty, DAYS, weekdayOf } from "../lib/api";

/**
 * Where every session of every course went: attended, missed, or never marked.
 *
 * Profile's budget answers "how many more can I skip", which is a forecast.
 * This answers "what actually happened", which is a different question — and
 * the one that surfaces the third category the budget has no way to show. An
 * unmarked class writes nothing to the database, so it is invisible to
 * anything that counts records; it only appears once you compare the marks
 * against the timetable they were supposed to cover.
 */
export default function AttendanceBreakdown({
  classes, attendance, term, now, overrides = [], onBack,
}) {
  const rows = useMemo(
    () => attendanceBreakdown(classes, attendance, term, now, overrides),
    [classes, attendance, term, now, overrides],
  );

  // One total line is worth more than eight cards read in sequence, but only
  // when the numbers underneath it mean the same thing — so it is skipped
  // entirely when the gap can't be computed.
  const total = useMemo(() => {
    if (rows.some((r) => r.unmarked === null)) return null;
    return rows.reduce(
      (acc, r) => ({
        present: acc.present + r.present,
        absent: acc.absent + r.absent,
        unmarked: acc.unmarked + r.unmarked,
        // Carried so the headline session count matches what the cards add up
        // to, rather than being re-derived from the buckets.
        expected: acc.expected + r.expected,
      }),
      { present: 0, absent: 0, unmarked: 0, expected: 0 },
    );
  }, [rows]);

  if (!rows.length) {
    return (
      <>
        <div className="eyebrow">Attendance breakdown</div>
        <div className="empty">Pick your courses and the split appears here.</div>
        {onBack && (
          <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
            Back to timetable
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">Attendance breakdown</div>
      <p className="screen-note">
        Every session so far this term, by course.
      </p>

      {!term && (
        <div className="banner warn" style={{ marginTop: 0, marginBottom: 16 }}>
          <p>
            No term calendar is published, so there's no way to tell which
            sessions should have happened. Marks are shown; the "did not mark"
            column can't be worked out.
          </p>
        </div>
      )}

      {total && <TotalCard total={total} />}

      {rows.map((r) => (
        <CourseRow key={r.subject} row={r} />
      ))}

      <p className="ab-foot">
        "Did not mark" is a gap in your record, not an absence. Edit attendance
        fills them in.
      </p>

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
    </>
  );
}

/** The batch's own line at the top: the same three buckets, summed. */
function TotalCard({ total }) {
  return (
    <div className="ab-total">
      <div className="ab-total-head">
        <span>All courses</span>
        <span className="ab-total-count">
          {total.expected} {total.expected === 1 ? "session" : "sessions"}
        </span>
      </div>
      <Counts present={total.present} absent={total.absent} unmarked={total.unmarked} />
    </div>
  );
}

/**
 * One course, opening onto the dates behind its totals.
 *
 * A `<details>` rather than a button and a piece of state, because that is
 * exactly what this is: a disclosure, and the element already handles the
 * keyboard, the ARIA and the open/closed semantics that hand-rolling it would
 * have to reimplement and get subtly wrong. `<summary>` takes flow content,
 * so the whole card — bar and legend included — is the hit target.
 *
 * Without a term calendar there are no sessions to list, so the card stays a
 * plain div: a disclosure that opens onto nothing is worse than none.
 */
function CourseRow({ row: r }) {
  const summary = (
    <>
      <div className="ab-head">
        <div className="ab-name">{r.subject}</div>
        {r.pct !== null && (
          <div className={`ab-pct${r.pct < 75 ? " low" : ""}`}>{r.pct}%</div>
        )}
      </div>
      <div className="ab-sub">
        {r.expected === null
          ? `${r.marked} marked`
          : `${r.expected} ${r.expected === 1 ? "session" : "sessions"} so far`}
      </div>

      <Counts present={r.present} absent={r.absent} unmarked={r.unmarked} />
    </>
  );

  if (!r.sessions?.length) return <div className="ab-card">{summary}</div>;

  return (
    <details className="ab-card">
      <summary className="ab-summary">
        {summary}
        <span className="ab-more">
          <ChevronIcon />
          Date-wise Breakdown
        </span>
      </summary>

      <div className="ab-sessions">
        {r.sessions.map((s) => (
          <div
            className="ab-session"
            key={`${s.date}|${s.start_time}|${s.movedFrom ?? ""}`}
          >
            <span className="ab-when">
              <b>{DAYS[weekdayOf(new Date(`${s.date}T00:00:00`)) - 1]}</b>
              {" "}
              {new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, {
                day: "numeric", month: "short",
              })}
              {s.movedFrom && <span className="tag signal">moved</span>}
            </span>
            <span className="ab-at">{pretty(s.start_time).replace(" ", "")}</span>
            <span className={`ab-status ${shownStatus(s.status)}`}>
              {LABEL[shownStatus(s.status)]}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

const LABEL = {
  present: "Present",
  absent: "Absent",
  unmarked: "Did not mark",
};

/**
 * Only two statuses can be set now. A row written before "cancelled" was
 * retired still reports it, so it is folded into the gap rather than left to
 * look up a label that no longer exists and render an empty chip.
 */
const shownStatus = (status) =>
  status === "present" || status === "absent" ? status : "unmarked";

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

/**
 * The three buckets as counts.
 *
 * These carried a proportional bar above them until it was cut: with four or
 * five courses on screen the bars invited comparison between courses that do
 * not have the same number of sessions, which is a comparison that means
 * nothing. The numbers say the same thing and say it exactly.
 *
 * The colour squares stay: they tie each bucket to the matching chip in the
 * date-wise list below, so a count and a row read as the same fact.
 */
function Counts({ present, absent, unmarked }) {
  return (
    <div className="ab-legend">
      <span className="ab-key present"><i />Present <b>{present}</b></span>
      <span className="ab-key absent"><i />Absent <b>{absent}</b></span>
      <span className="ab-key unmarked">
        <i />Did not mark <b>{unmarked === null ? "—" : unmarked}</b>
      </span>
    </div>
  );
}
