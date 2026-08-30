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
        // Carried so the headline session count matches what the cards add
        // up to. Summing only the three buckets would quietly report fewer
        // sessions than the term actually held.
        cancelled: acc.cancelled + r.cancelled,
        expected: acc.expected + r.expected,
      }),
      { present: 0, absent: 0, unmarked: 0, cancelled: 0, expected: 0 },
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
        Every session so far this term, by course. Classes still to come aren't
        counted, and neither is today's until it has finished.
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

      {total && <TotalBar total={total} />}

      {rows.map((r) => (
        <CourseRow key={r.subject} row={r} />
      ))}

      <p className="ab-foot">
        "Did not mark" is a gap in your own record, not an absence — the
        institute's register is separate. Missed Attendances lets you fill
        them in.
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
function TotalBar({ total }) {
  return (
    <div className="ab-total">
      <div className="ab-total-head">
        <span>All courses</span>
        <span className="ab-total-count">
          {total.expected} {total.expected === 1 ? "session" : "sessions"}
          {total.cancelled > 0 && ` · ${total.cancelled} cancelled`}
        </span>
      </div>
      <SplitBar present={total.present} absent={total.absent} unmarked={total.unmarked} />
      <Legend present={total.present} absent={total.absent} unmarked={total.unmarked} />
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
        {r.cancelled > 0 && ` · ${r.cancelled} cancelled`}
      </div>

      <SplitBar present={r.present} absent={r.absent} unmarked={r.unmarked} />
      <Legend present={r.present} absent={r.absent} unmarked={r.unmarked} />
    </>
  );

  if (!r.sessions?.length) return <div className="ab-card">{summary}</div>;

  return (
    <details className="ab-card">
      <summary className="ab-summary">
        {summary}
        <span className="ab-more">
          <ChevronIcon />
          Date by date
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
            <span className={`ab-status ${s.status ?? "unmarked"}`}>
              {LABEL[s.status ?? "unmarked"]}
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
  cancelled: "Cancelled",
  unmarked: "Did not mark",
};

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
 * The three buckets as one bar.
 *
 * Given widths in percent so the segments stay proportional at any card
 * width, and hidden from assistive technology because the counts underneath
 * say the same thing in words — a screen reader announcing three unlabelled
 * percentages is noise, not information.
 */
function SplitBar({ present, absent, unmarked }) {
  const sum = present + absent + (unmarked ?? 0);
  if (!sum) return <div className="ab-bar empty" aria-hidden="true" />;
  const pc = (n) => `${(n / sum) * 100}%`;
  return (
    <div className="ab-bar" aria-hidden="true">
      {present > 0 && <span className="ab-seg present" style={{ width: pc(present) }} />}
      {absent > 0 && <span className="ab-seg absent" style={{ width: pc(absent) }} />}
      {unmarked > 0 && <span className="ab-seg unmarked" style={{ width: pc(unmarked) }} />}
    </div>
  );
}

function Legend({ present, absent, unmarked }) {
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
