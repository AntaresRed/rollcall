import { useMemo } from "react";
import {
  DAY_LONG, PHASE_LABEL, pretty, toMinutes, weekdayOf, isoDate, inSession,
} from "../lib/api";

export default function Today({ classes, attendance, term, now, onMark }) {
  const today = weekdayOf(now);
  const date = isoDate(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const list = useMemo(
    () =>
      classes
        .filter((c) => c.day_of_week === today && inSession(c.term_phase, date, term))
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
    [classes, today, date, term],
  );

  const statusOf = (subject) =>
    attendance.find((a) => a.subject === subject && a.class_date === date)?.status ?? null;

  // The now-marker sits above the first class still to come.
  const nextIndex = list.findIndex((c) => toMinutes(c.end_time) > nowMins);

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  if (!list.length) {
    return (
      <>
        <div className="eyebrow">{DAY_LONG[today]}</div>
        <div className="empty">
          Nothing scheduled today. Your next class shows up here automatically.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">{DAY_LONG[today]}</div>
      <div className="day">
        {list.map((c, i) => {
          const status = statusOf(c.subject);
          const past = toMinutes(c.end_time) <= nowMins;
          const live =
            toMinutes(c.start_time) <= nowMins && nowMins < toMinutes(c.end_time);
          const phase = PHASE_LABEL[c.term_phase];

          return (
            <div key={c.id}>
              {i === nextIndex && !live && (
                <div className="now-line" aria-hidden="true">
                  <span className="now-label">{clock}</span>
                  <span className="now-rule" />
                </div>
              )}

              <div className={`slot${past ? " is-past" : ""}${i === nextIndex ? " is-next" : ""}`}>
                <div className="slot-time">
                  {pretty(c.start_time).replace(" ", "")}
                  <small>{pretty(c.end_time).replace(" ", "")}</small>
                </div>

                <div>
                  <div className="course">{c.subject}</div>
                  <div className="meta">
                    {c.room && <span>{c.room}</span>}
                    {phase && <span className="tag">{phase}</span>}
                    {live && <span className="tag signal">In session</span>}
                  </div>

                  <div className="marks">
                    {[
                      ["present", "Present"],
                      ["absent", "Absent"],
                      ["cancelled", "Cancelled"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={`mark ${key}`}
                        aria-pressed={status === key}
                        onClick={() =>
                          onMark(c.id, c.subject, date, status === key ? null : key)
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
