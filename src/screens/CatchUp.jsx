import { useMemo } from "react";
import { unmarkedSessions, pretty, DAY_LONG, weekdayOf } from "../lib/api";

/**
 * Sessions that have already happened and were never marked.
 *
 * Without this the attendance number quietly rots: forget one day and it's
 * unrecoverable, so after a few weeks the percentage reflects diligence at
 * tapping buttons rather than actual attendance.
 *
 * Reached from the timetable rather than from a tab of its own. What it lists
 * is a property of the week that has just gone, so it sits with the other
 * screens about the schedule; the count that used to justify the tab now
 * rides on the timetable's own badge, which is what actually gets a student
 * to open it.
 */
export default function CatchUp({
  classes, attendance, term, overrides = [], now, onMark, onBack,
}) {
  const pending = useMemo(
    () => unmarkedSessions(classes, attendance, term, now, 28, overrides),
    [classes, attendance, term, now, overrides],
  );

  const byDate = useMemo(() => {
    const groups = new Map();
    for (const item of pending) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    return [...groups.entries()];
  }, [pending]);

  if (!classes.length) {
    return (
      <>
        <div className="eyebrow">Catch up</div>
        <div className="empty">Pick your courses first.</div>
      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
      </>
    );
  }

  if (!pending.length) {
    return (
      <>
        <div className="eyebrow">Catch up</div>
        <div className="empty">
          Nothing outstanding — every class this term is marked.
        </div>
      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
      </>
    );
  }

  const label = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((today - d) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return DAY_LONG[weekdayOf(d)];
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };

  return (
    <>
      <div className="eyebrow">Catch up</div>
      <p style={{ color: "var(--slate)", fontSize: 14, margin: "0 0 14px" }}>
        {pending.length} {pending.length === 1 ? "session" : "sessions"} this term
        with no mark.
      </p>

      {byDate.map(([date, items]) => (
        <div key={date} className="catchup-day">
          <div className="catchup-date">
            {label(date)}
            <span>{date}</span>
          </div>

          {items.map(({ cls, movedFrom }) => (
            // movedFrom is part of the identity, not decoration. A class
            // pushed from one Monday to the next lands on a date it already
            // meets, at the same slot — without it both occurrences carry the
            // same key and React renders one where there should be two.
            <div
              className="catchup-row"
              key={`${cls.id}-${date}-${cls.start_time}-${movedFrom ?? ""}`}
            >
              <div className="catchup-time">{pretty(cls.start_time).replace(" ", "")}</div>
              <div style={{ minWidth: 0 }}>
                <div className="course">{cls.subject}</div>
                {movedFrom && <div className="meta"><span className="tag signal">rescheduled</span></div>}
                <div className="marks">
                  <button className="mark present" onClick={() => onMark(cls, date, "present")}>
                    Present
                  </button>
                  <button className="mark absent" onClick={() => onMark(cls, date, "absent")}>
                    Absent
                  </button>
                  <button className="mark cancelled" onClick={() => onMark(cls, date, "cancelled")}>
                    Cancelled
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
    </>
  );
}
