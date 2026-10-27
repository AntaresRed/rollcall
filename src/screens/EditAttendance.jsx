import { useMemo } from "react";
import {
  markableSessions, unmarkedSessions, pretty, toMinutes, hhmm, DAY_LONG, weekdayOf, isoDate,
} from "../lib/api";
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

  // Dates with a class that has ended and was never marked, for the section
  // on top — the same sessions the tab badge counts, so the two never
  // disagree. Only those classes are shown there; the date's other classes
  // are in its entry in the full list, where the date appears too.
  const missedByDate = useMemo(() => {
    const groups = new Map();
    for (const item of unmarkedSessions(classes, attendance, term, now, 28, overrides)) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [classes, attendance, term, now, overrides]);
  const missedCount = missedByDate.reduce((n, [, items]) => n + items.length, 0);

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

  // Date first, as on Reschedule, then which day it was. The ISO date that
  // used to sit beside it was the thing to find and the hardest to read.
  const dateOf = (iso) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const dayOf = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((midnight - d) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return DAY_LONG[weekdayOf(d)];
  };

  const renderDay = (scope) => ([date, items]) => (
    <DayFold
      key={`${scope}:${date}`}
      heading={dateOf(date)}
      aside={dayOf(date)}
      today={date === today}
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
  );

  return (
    <>
      <div className="eyebrow">Edit attendance</div>
      {/* No count here: "Not marked" below has it, and this one also took in
          a class still running, so the two numbers disagreed. */}
      <p className="screen-note">
        Tap to set or change a mark — tap it again to clear.
      </p>

      {/* The to-do first. A date leaves this list once its last missed
          class is marked, so it empties as the student works through it. */}
      {missedByDate.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 0 }}>
            Not marked
            <span className="tag signal">{missedCount}</span>
          </div>
          <div className="daylist-missed">
            {missedByDate.map(renderDay("missed"))}
          </div>
        </>
      )}

      <div className="eyebrow">All dates</div>
      {byDate.map(renderDay("all"))}

      {back}
    </>
  );
}

/**
 * A closed day's marks at a glance: a filled chip per kind, a mark and a
 * count — ✓ present, ✗ absent, ! not marked — in the colours those mean
 * everywhere else. The small squares this replaced were easy to miss. Zeros
 * are left out, so a fully marked day is one or two chips.
 */
function Tally({ items }) {
  const count = (status) => items.filter((s) => s.status === status).length;
  const parts = [
    ["present", "✓", "present", count("present")],
    ["absent", "✗", "absent", count("absent")],
    ["unmarked", "!", "not marked", count(null)],
  ].filter(([, , , n]) => n > 0);
  return (
    <div className="daylist-tally">
      {parts.map(([key, sign, , n]) => (
        <span key={key} className={`day-chip ${key}`} aria-hidden="true">{sign} {n}</span>
      ))}
      <span className="sr-only">{parts.map(([, , word, n]) => `${n} ${word}`).join(", ")}</span>
    </div>
  );
}
