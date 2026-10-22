import { useMemo } from "react";
import { markableSessions, pretty, toMinutes, hhmm, DAY_LONG, weekdayOf, isoDate } from "../lib/api";
import DayFold from "./DayFold";

/**
 * Every class that has already begun, and the mark against each one.
 *
 * This began as a catch-up list: only the sessions with no mark, so a
 * forgotten week could be filled in. That answered half the problem. The other
 * half is a mark that is simply wrong — marked present in a hurry, or absent
 * for a class that was actually missed — and nothing in the app could change
 * one once the day had passed. So the list is now every session, with
 * its current mark shown, and the buttons set or change it.
 *
 * A class still running is included: that is when people actually reach for
 * the app. One that has not started is not, because attendance for it is not
 * a fact yet and a button offering to record one is inviting a guess.
 */

// The term ends up around ninety sessions. Every date is listed, newest first
// and folded shut (DayFold), so the whole term is one short scroll; it used to
// show ten days and hide the rest behind a "Show earlier" button.
export default function EditAttendance({
  classes, attendance, term, overrides = [], now, onMark, onBack, readOnly = false,
}) {
  const sessions = useMemo(
    () => markableSessions(classes, attendance, term, now, 28, overrides),
    [classes, attendance, term, now, overrides],
  );

  const byDate = useMemo(() => {
    const groups = new Map();
    for (const item of sessions) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [sessions]);

  const unmarked = sessions.filter((s) => s.status === null).length;

  // Today's class can appear here while it is still running, which is worth
  // saying: otherwise a row for a class you are sitting in reads as a mistake.
  const today = isoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isLive = (cls, date) =>
    date === today &&
    toMinutes(hhmm(cls.start_time)) <= nowMinutes &&
    nowMinutes < toMinutes(hhmm(cls.end_time));

  const back = onBack && (
    <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
      Back to timetable
    </button>
  );

  if (!classes.length) {
    return (
      <>
        <div className="eyebrow">Edit attendance</div>
        <div className="empty">Pick your courses first.</div>
        {back}
      </>
    );
  }

  if (!sessions.length) {
    return (
      <>
        <div className="eyebrow">Edit attendance</div>
        <div className="empty">No class has started yet this term.</div>
        {back}
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
      <div className="eyebrow">Edit attendance</div>
      <p className="screen-note">
        Tap to set or change a mark — tap it again to clear.
        {unmarked > 0 && ` ${unmarked} not marked yet.`}
      </p>

      {byDate.map(([date, items]) => (
        <DayFold
          key={date}
          heading={label(date)}
          aside={date}
          tally={<Tally items={items} />}
        >
          {items.map(({ cls, movedFrom, status }) => (
            // movedFrom is part of the identity, not decoration. A class
            // pushed from one Monday to the next lands on a date it already
            // meets, at the same slot — without it both occurrences carry the
            // same key and React renders one where there should be two.
            <div
              className="daylist-row"
              key={`${cls.id}-${date}-${cls.start_time}-${movedFrom ?? ""}`}
            >
              <div className="daylist-time">{pretty(cls.start_time).replace(" ", "")}</div>
              <div style={{ minWidth: 0 }}>
                <div className="course">{cls.subject}</div>
                {(isLive(cls, date) || movedFrom) && (
                  <div className="meta">
                    {isLive(cls, date) && <span className="tag signal">In session</span>}
                    {movedFrom && <span className="tag signal">rescheduled</span>}
                  </div>
                )}
                <div className="marks choice">
                  {[
                    ["present", "Present"],
                    ["absent", "Absent"],
                  ].map(([key, text]) => (
                    <button
                      key={key}
                      className={`mark ${key}`}
                      aria-pressed={status === key}
                      // Off while an admin is reading another year's app:
                      // these rows are synthesised and own no attendance.
                      disabled={readOnly}
                      onClick={() => onMark(cls, date, status === key ? null : key)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </DayFold>
      ))}

      {back}
    </>
  );
}

/**
 * A closed day's marks at a glance, in the Present / Absent / Did not mark
 * colours the breakdown already uses. Zeros are left out so a fully marked
 * day reads as one or two squares, not three.
 */
function Tally({ items }) {
  const count = (status) => items.filter((s) => s.status === status).length;
  const parts = [
    ["present", "present", count("present")],
    ["absent", "absent", count("absent")],
    ["unmarked", "not marked", count(null)],
  ].filter(([, , n]) => n > 0);
  return (
    <div className="daylist-tally">
      {parts.map(([key, , n]) => (
        <span key={key} className={`ab-key ${key}`} aria-hidden="true"><i /><b>{n}</b></span>
      ))}
      <span className="sr-only">{parts.map(([, word, n]) => `${n} ${word}`).join(", ")}</span>
    </div>
  );
}
