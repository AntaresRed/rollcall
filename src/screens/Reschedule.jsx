import { useMemo, useState } from "react";
import {
  SLOT_STARTS, SLOT_ENDS, DAY_LONG,
  pretty, isoDate, weekdayOf, expectedSessions, hhmm,
} from "../lib/api";

const DAY_MS = 86_400_000;
const HORIZON_DAYS = 21;

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
 */
export default function Reschedule({ classes, term, overrides, now, onMove, onClear, onBack }) {
  const [editing, setEditing] = useState(null);   // `${classId}|${date}`
  const [form, setForm] = useState({ date: "", start: "" });
  const [busy, setBusy] = useState(false);

  const today = isoDate(now);
  const horizon = isoDate(new Date(now.getTime() + HORIZON_DAYS * DAY_MS));

  const upcoming = useMemo(
    () => expectedSessions(classes, term, { from: today, to: horizon }, overrides),
    [classes, term, overrides, today, horizon],
  );

  const changed = useMemo(() => {
    const byId = new Map(classes.map((c) => [c.id, c]));
    return overrides
      .map((o) => ({ ...o, cls: byId.get(o.class_id) }))
      .filter((o) => o.cls)
      .sort((a, b) => a.original_date.localeCompare(b.original_date));
  }, [overrides, classes]);

  const byDate = useMemo(() => {
    const groups = new Map();
    for (const item of upcoming) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [upcoming]);

  const open = (cls, date) => {
    setEditing(`${cls.id}|${date}`);
    setForm({ date, start: hhmm(cls.start_time) });
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
      <p style={{ color: "var(--slate)", fontSize: 14, margin: "0 0 16px" }}>
        Moving a class changes that one meeting only — the rest of the term
        carries on as published. Alerts follow the class to its new slot.
      </p>

      {changed.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 0 }}>Changes you've made</div>
          {changed.map((o) => (
            <div className="moved-row" key={`${o.class_id}|${o.original_date}`}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="course">{o.cls.subject}</div>
                <div className="meta">
                  {o.new_date ? (
                    <>
                      <span className="strike">{fmtDate(o.original_date)}</span>
                      <span>→ {fmtDate(o.new_date)} {pretty(o.new_start ?? hhmm(o.cls.start_time))}</span>
                    </>
                  ) : (
                    <>
                      <span className="strike">{fmtDate(o.original_date)}</span>
                      <span className="tag">cancelled</span>
                    </>
                  )}
                </div>
              </div>
              <button className="mark" onClick={() => onClear(o.class_id, o.original_date)}>
                Undo
              </button>
            </div>
          ))}
        </>
      )}

      <div className="eyebrow">Next three weeks</div>

      {byDate.length === 0 && (
        <div className="empty">
          No classes scheduled in the next three weeks.
        </div>
      )}

      {byDate.map(([date, items]) => (
        <div key={date} className="catchup-day">
          <div className="catchup-date">
            {date === today ? "Today" : DAY_LONG[weekdayOf(new Date(`${date}T00:00:00`))]}
            <span>{fmtDate(date)}</span>
          </div>

          {items.map(({ cls, movedFrom }) => {
            const key = `${cls.id}|${movedFrom ?? date}`;
            const isEditing = editing === key;

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

                  {!isEditing ? (
                    <div className="marks">
                      <button className="mark" onClick={() => open(cls, movedFrom ?? date)}>
                        Move
                      </button>
                      <button className="mark" onClick={() => cancel(cls, movedFrom ?? date)}>
                        Cancelled
                      </button>
                    </div>
                  ) : (
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
                          onClick={() => submit(cls, movedFrom ?? date)}
                        >
                          {busy ? "Saving…" : "Move it"}
                        </button>
                        <button className="mark" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
