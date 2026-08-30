import { useMemo, useState } from "react";
import {
  SLOT_STARTS, SLOT_ENDS, DAY_LONG,
  pretty, isoDate, weekdayOf, expectedSessions, hhmm,
} from "../lib/api";

const DAY_MS = 86_400_000;
const HORIZON_DAYS = 21;
// Symmetrical with the horizon. A class is usually only known to have moved
// once it hasn't happened — the notice comes late, or the professor says so
// in the class before — so the window a student needs to reach backwards into
// is the same size as the one they plan forwards in.
const LOOKBACK_DAYS = 21;

const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });

/**
 * Move or cancel a single occurrence of a class.
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
  const [form, setForm] = useState({ date: "", start: "" });
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const today = isoDate(now);
  const horizon = isoDate(new Date(now.getTime() + HORIZON_DAYS * DAY_MS));
  // Never reach back past the start of term — there are no sessions there,
  // and an override against a date outside the term would never resolve.
  const earliest = useMemo(() => {
    const back = isoDate(new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS));
    return term?.term_start && term.term_start > back ? term.term_start : back;
  }, [now, term]);

  const sessions = useMemo(
    () => expectedSessions(classes, term, { from: earliest, to: horizon }, overrides),
    [classes, term, overrides, earliest, horizon],
  );

  const changed = useMemo(() => {
    const byId = new Map(classes.map((c) => [c.id, c]));
    return overrides
      .map((o) => ({ ...o, cls: byId.get(o.class_id) }))
      .filter((o) => o.cls)
      .sort((a, b) => a.original_date.localeCompare(b.original_date));
  }, [overrides, classes]);

  // One pass over the window, split at today. Past days read newest-first —
  // the class you're most likely to be entering is the one that just
  // happened, not one from three weeks ago.
  const [pastByDate, upcomingByDate] = useMemo(() => {
    const groups = new Map();
    for (const item of sessions) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    const all = [...groups.entries()];
    return [
      all.filter(([d]) => d < today).sort((a, b) => b[0].localeCompare(a[0])),
      all.filter(([d]) => d >= today).sort((a, b) => a[0].localeCompare(b[0])),
    ];
  }, [sessions, today]);

  const pastCount = pastByDate.reduce((n, [, items]) => n + items.length, 0);

  // `originalDate` identifies the override; `date`/`start` only seed the form,
  // and are where the meeting currently sits — a session already moved once
  // should open showing where it is now, not where the timetable first put it.
  const open = (scope, cls, originalDate, { date, start }) => {
    setEditing(`${scope}:${cls.id}|${originalDate}`);
    setForm({ date: date ?? originalDate, start: hhmm(start ?? cls.start_time) });
  };

  const submit = async (cls, originalDate) => {
    setBusy(true);
    try {
      await onMove(cls, originalDate, {
        newDate: form.date,
        newStart: form.start,
        newEnd: SLOT_ENDS[form.start] ?? null,
      });
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (cls, originalDate) => {
    setBusy(true);
    try {
      await onMove(cls, originalDate, { newDate: null });
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const formFor = (cls, originalDate) => (
    <MoveForm
      form={form}
      setForm={setForm}
      term={term}
      busy={busy}
      onSubmit={() => submit(cls, originalDate)}
      onCancel={() => setEditing(null)}
    />
  );

  const renderDay = ([date, items]) => (
    <div key={date} className="catchup-day">
      <div className="catchup-date">
        {date === today ? "Today" : DAY_LONG[weekdayOf(new Date(`${date}T00:00:00`))]}
        <span>{fmtDate(date)}</span>
      </div>

      {items.map(({ cls, movedFrom }) => {
        const originalDate = movedFrom ?? date;
        const key = `day:${cls.id}|${originalDate}`;

        return (
          <div className="catchup-row" key={key}>
            <div className="catchup-time">
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
                  <button className="mark" onClick={() => cancel(cls, originalDate)}>
                    Cancelled
                  </button>
                </div>
              ) : (
                formFor(cls, originalDate)
              )}
            </div>
          </div>
        );
      })}
    </div>
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

      {changed.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 0 }}>Changes you've made</div>
          {changed.map((o) => {
            const key = `changes:${o.class_id}|${o.original_date}`;
            return (
              <div className="moved-row" key={key}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="course">{o.cls.subject}</div>
                  <div className="meta">
                    <span className="strike">{fmtDate(o.original_date)}</span>
                    {o.new_date ? (
                      <span>→ {fmtDate(o.new_date)} {pretty(o.new_start ?? hhmm(o.cls.start_time))}</span>
                    ) : (
                      <span className="tag">cancelled</span>
                    )}
                  </div>

                  {/* Editable from here as well as from the day list, because
                      a session moved outside the three-week window shows up
                      nowhere else — and a second change to the same meeting
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
                          date: o.new_date ?? o.original_date,
                          start: o.new_start ?? o.cls.start_time,
                        })}
                      >
                        {o.new_date ? "Move again" : "Give it a date"}
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

      {pastCount > 0 && (
        <>
          <button
            className="disclosure"
            aria-expanded={showPast}
            onClick={() => setShowPast((v) => !v)}
          >
            <span className={`disclosure-caret${showPast ? " open" : ""}`} aria-hidden="true" />
            {showPast ? "Hide earlier classes" : "Earlier classes"}
            <span className="tag quiet">{pastCount}</span>
          </button>
          {showPast && (
            <>
              <p className="screen-note" style={{ marginTop: 10 }}>
                The last three weeks.
              </p>
              {pastByDate.map(renderDay)}
            </>
          )}
        </>
      )}

      <div className="eyebrow">Next three weeks</div>

      {upcomingByDate.length === 0 && (
        <div className="empty">
          No classes scheduled in the next three weeks.
        </div>
      )}

      {upcomingByDate.map(renderDay)}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
    </>
  );
}

/**
 * The date and slot picker, shared by the day list and the changes list.
 *
 * `min` is the start of term rather than today: the whole point is that the
 * new date may be in the past, either because the class was held early or
 * because it's being entered after the fact.
 */
function MoveForm({ form, setForm, term, busy, onSubmit, onCancel }) {
  return (
    <div className="reschedule-form">
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
      <div style={{ display: "flex", gap: 6 }}>
        <button
          className="btn"
          style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
          disabled={busy || !form.date}
          onClick={onSubmit}
        >
          {busy ? "Saving…" : "Move it"}
        </button>
        <button className="mark" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
