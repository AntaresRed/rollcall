import { useMemo, useState } from "react";
import {
  SLOT_STARTS, SLOT_ENDS, DAY_LONG,
  pretty, isoDate, weekdayOf, expectedSessions, hhmm, undecidedReschedules,
} from "../lib/api";
import DayFold from "./DayFold";

const DAY_MS = 86_400_000;
// Only used with no term calendar, when there's no term to span. Symmetrical:
// a class is usually only known to have moved once it hasn't happened, so the
// reach backwards matters as much as the reach forwards.
const FALLBACK_DAYS = 21;

const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });

/**
 * Move a single occurrence of a class to another slot — or record that it has
 * been rescheduled with the new date not decided yet.
 *
 * Cancelling outright is deliberately not offered: classes here are
 * rescheduled rather than called off. But the notice often arrives before the
 * new date does, and a student made to pick a date to record the change will
 * pick a wrong one. "Date not decided" takes the class off its slot and holds
 * it in its own list at the top, badged like Edit attendance, until it is
 * given a date. Entries saved as "cancelled" before this are the same shape,
 * so they land in that list too.
 *
 * Weekly courses have no row per occurrence — they're generated from the
 * pattern — so a change here is stored as an exception against the date the
 * class was originally due, and only ever affects that one meeting.
 *
 * Past dates are as movable as future ones. The original restriction to
 * upcoming sessions assumed rescheduling is always planning, but the common
 * case is the opposite: a class was shifted, the student is entering it after
 * the fact, and the date it was due has already gone by. That entry has to be
 * possible or the attendance record quietly diverges from what happened.
 */
export default function Reschedule({ classes, term, overrides, now, onMove, onClear, onBack }) {
  // Scoped by where it was opened from: the same meeting can appear both in
  // the day list and in "changes you've made", and an unscoped key would open
  // the form in both places at once.
  const [editing, setEditing] = useState(null);   // `${scope}:${classId}|${originalDate}`
  const [form, setForm] = useState({ date: "", start: "", undecided: false });
  const [busy, setBusy] = useState(false);

  const today = isoDate(now);
  // The whole term, start to end. This used to be three weeks either side of
  // today, which left a class announced as moving later in the term with
  // nowhere to be entered. Folding each date (DayFold) is what keeps a term's
  // worth of dates short enough to scroll.
  const wholeTerm = Boolean(term?.term_start && term?.term_end);
  const [from, to] = useMemo(() => wholeTerm
    ? [term.term_start, term.term_end]
    : [
        isoDate(new Date(now.getTime() - FALLBACK_DAYS * DAY_MS)),
        isoDate(new Date(now.getTime() + FALLBACK_DAYS * DAY_MS)),
      ], [wholeTerm, term, now]);

  const sessions = useMemo(
    () => expectedSessions(classes, term, { from, to }, overrides),
    [classes, term, overrides, from, to],
  );

  // Classes waiting for a date, and moves that have one. Kept apart because
  // they ask different things of the student: the first is a to-do, the
  // second is a record to check or undo.
  const undecided = useMemo(
    () => undecidedReschedules(overrides, classes),
    [overrides, classes],
  );

  const changed = useMemo(() => {
    const byId = new Map(classes.map((c) => [c.id, c]));
    return overrides
      .filter((o) => o.new_date)
      .map((o) => ({ ...o, cls: byId.get(o.class_id) }))
      .filter((o) => o.cls)
      .sort((a, b) => a.original_date.localeCompare(b.original_date));
  }, [overrides, classes]);

  // One list, latest date first — the same direction as Edit attendance, so
  // the two screens read alike. It used to be split at today into upcoming and
  // earlier, each nearest-first; today now sits partway down, marked as such.
  const byDate = useMemo(() => {
    const groups = new Map();
    for (const item of sessions) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [sessions]);


  // `originalDate` identifies the override; `date`/`start` only seed the form,
  // and are where the meeting currently sits — a session already moved once
  // should open showing where it is now, not where the timetable first put it.
  const open = (scope, cls, originalDate, { date, start }) => {
    setEditing(`${scope}:${cls.id}|${originalDate}`);
    setForm({ date: date ?? originalDate, start: hhmm(start ?? cls.start_time), undecided: false });
  };

  const submit = async (cls, originalDate) => {
    setBusy(true);
    try {
      // No date is the whole of "not decided": the class leaves its slot and
      // lands nowhere until one is given.
      await onMove(cls, originalDate, form.undecided
        ? { newDate: null }
        : {
            newDate: form.date,
            newStart: form.start,
            newEnd: SLOT_ENDS[form.start] ?? null,
          });
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const formFor = (cls, originalDate, { allowUndecided = true } = {}) => (
    <MoveForm
      form={form}
      setForm={setForm}
      term={term}
      busy={busy}
      allowUndecided={allowUndecided}
      onSubmit={() => submit(cls, originalDate)}
      onCancel={() => setEditing(null)}
    />
  );

  const renderDay = ([date, items]) => (
    <DayFold
      key={date}
      // Date first, then the day. The date is what a reschedule notice gives,
      // so it's what the student scans this list for.
      heading={new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
      aside={date === today ? "Today" : DAY_LONG[weekdayOf(new Date(`${date}T00:00:00`))]}
      today={date === today}
      tally={<DayTally items={items} />}
    >

      {items.map(({ cls, movedFrom }) => {
        const originalDate = movedFrom ?? date;
        const key = `day:${cls.id}|${originalDate}`;

        return (
          <div className="daylist-row" key={key}>
            <div className="daylist-time">
              {pretty(cls.start_time).replace(" ", "")}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="course">{cls.subject}</div>
              <div className="meta">
                {cls.room && <span>{cls.room}</span>}
                {movedFrom && (
                  <span className="tag signal">moved from {fmtDate(movedFrom)}</span>
                )}
              </div>

              {editing !== key ? (
                <div className="marks">
                  <button
                    className="mark"
                    onClick={() => open("day", cls, originalDate, { date, start: cls.start_time })}
                  >
                    Move
                  </button>
                </div>
              ) : (
                formFor(cls, originalDate)
              )}
            </div>
          </div>
        );
      })}
    </DayFold>
  );

  if (!classes.length) {
    return (
      <>
        <div className="eyebrow">Reschedule</div>
        <div className="empty">Pick your courses first.</div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">Reschedule</div>
      <p className="screen-note">
        Changes that one class only — the rest of the term carries on as
        published.
      </p>

      {/* First on the screen: these are unfinished, and a class with no date
          is off the timetable entirely, so this is the one place it shows. */}
      {undecided.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 0 }}>
            Date not decided
            <span className="tag signal">{undecided.length}</span>
          </div>
          <p className="screen-note">
            Rescheduled, with no new date yet. They're off your timetable and
            don't count towards attendance until you give them one.
          </p>
          {undecided.map((o) => {
            const key = `undecided:${o.class_id}|${o.original_date}`;
            return (
              <div className="moved-row" key={key}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="course">{o.cls.subject}</div>
                  <div className="meta">
                    <span className="strike">
                      {fmtDate(o.original_date)} {pretty(o.cls.start_time)}
                    </span>
                    <span className="tag signal">date not decided</span>
                  </div>

                  {editing === key ? (
                    <div style={{ marginTop: 8 }}>
                      {/* Offering "not decided" again from here would be a
                          button that changes nothing. */}
                      {formFor(o.cls, o.original_date, { allowUndecided: false })}
                    </div>
                  ) : (
                    <div className="marks">
                      <button
                        className="mark"
                        onClick={() => open("undecided", o.cls, o.original_date, {
                          date: o.original_date,
                          start: o.cls.start_time,
                        })}
                      >
                        Give it a date
                      </button>
                      <button className="mark" onClick={() => onClear(o.class_id, o.original_date)}>
                        Undo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {changed.length > 0 && (
        <>
          <div className="eyebrow" style={undecided.length ? undefined : { marginTop: 0 }}>
            Changes you've made
          </div>
          {changed.map((o) => {
            const key = `changes:${o.class_id}|${o.original_date}`;
            return (
              <div className="moved-row" key={key}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="course">{o.cls.subject}</div>
                  <div className="meta">
                    <span className="strike">{fmtDate(o.original_date)}</span>
                    <span>→ {fmtDate(o.new_date)} {pretty(o.new_start ?? hhmm(o.cls.start_time))}</span>
                  </div>

                  {/* Editable from here as well as from the day list, because
                      a session moved outside the listed dates (past the term's
                      end, or beyond the window when there's no calendar) shows
                      up nowhere else — and a second change to the same meeting
                      is exactly the case that used to be unreachable. */}
                  {editing === key ? (
                    <div style={{ marginTop: 8 }}>
                      {formFor(o.cls, o.original_date)}
                    </div>
                  ) : (
                    <div className="marks">
                      <button
                        className="mark"
                        onClick={() => open("changes", o.cls, o.original_date, {
                          date: o.new_date,
                          start: o.new_start ?? o.cls.start_time,
                        })}
                      >
                        Move again
                      </button>
                      <button className="mark" onClick={() => onClear(o.class_id, o.original_date)}>
                        Undo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className="eyebrow">{wholeTerm ? "This term" : "Three weeks either side of today"}</div>

      {byDate.length === 0 && (
        <div className="empty">
          {wholeTerm ? "No classes this term." : "No classes in the three weeks either side of today."}
        </div>
      )}

      {byDate.map(renderDay)}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
    </>
  );
}

/**
 * A closed day's contents: how many classes, and whether any of them is one
 * already moved here — the thing a student checking their changes looks for.
 */
function DayTally({ items }) {
  const moved = items.filter((s) => s.movedFrom).length;
  return (
    <div className="daylist-tally">
      <span>{items.length} {items.length === 1 ? "class" : "classes"}</span>
      {moved > 0 && <span className="tag signal">{moved} moved</span>}
    </div>
  );
}

/**
 * The date and slot picker, shared by every list on the screen.
 *
 * `min` is the start of term rather than today: the whole point is that the
 * new date may be in the past, either because the class was held early or
 * because it's being entered after the fact.
 *
 * "Date not decided" is offered as the other answer to the same question
 * rather than as a separate button on each row. It is what a student reaches
 * for at the moment they open this form — they know the class moved and not
 * yet where — and it belongs next to the date picker it replaces.
 */
function MoveForm({ form, setForm, term, busy, allowUndecided = true, onSubmit, onCancel }) {
  const undecided = allowUndecided && form.undecided;
  return (
    <div className="reschedule-form">
      {allowUndecided && (
        <div className="marks choice reschedule-when" role="group" aria-label="When is it now?">
          <button
            type="button"
            className="mark"
            aria-pressed={!form.undecided}
            onClick={() => setForm((f) => ({ ...f, undecided: false }))}
          >
            New date
          </button>
          <button
            type="button"
            className="mark"
            aria-pressed={form.undecided}
            onClick={() => setForm((f) => ({ ...f, undecided: true }))}
          >
            Not decided
          </button>
        </div>
      )}

      {undecided ? (
        <p className="reschedule-hint">
          It comes off your timetable and waits at the top of this screen until
          you give it a date. No alerts for it, and it won't count towards
          attendance in the meantime.
        </p>
      ) : (
        <>
          <label>
            <span>New date</span>
            <input
              type="date"
              value={form.date}
              min={term?.term_start}
              max={term?.term_end}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label>
            <span>New time</span>
            <select
              value={form.start}
              onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
            >
              {SLOT_STARTS.map((sl) => (
                <option key={sl} value={sl}>{pretty(sl)}</option>
              ))}
              {!SLOT_STARTS.includes(form.start) && (
                <option value={form.start}>{pretty(form.start)}</option>
              )}
            </select>
          </label>
        </>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          className="btn"
          style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
          disabled={busy || (!undecided && !form.date)}
          onClick={onSubmit}
        >
          {busy ? "Saving…" : undecided ? "Save as not decided" : "Move it"}
        </button>
        <button className="mark" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
